#!/usr/bin/perl
# design2react.pl: turns a locked design file (design/*.dc.html) into a React view, verbatim.
#
#   perl tools/design2react.pl <design.html> <PageId> <ComponentName> <out-dir> <catalogue.json>
#
# What it does (DESIGN_LOCK.md):
#  - Markup and every inline style are copied exactly; style="..." becomes style={sx("...")}.
#  - Design-runtime constructs become plain React: {{ x }} -> v.x, <sc-if> -> conditional,
#    <sc-for> -> map, sc-camel-on-click -> onClick, style-hover -> a :hover class.
#  - Every piece of wording (text, placeholder, aria-label, alt, title) becomes a key in the
#    text catalogue, so the view has no words in it and each tenant can change every word.
#  - <helmet> styles (keyframes etc.) go to a scoped CSS file.
# Output: <out-dir>/<ComponentName>.tsx and <ComponentName>.css; the catalogue JSON is written
# to <catalogue.json> (seed data for the tenant, not app code).
use strict;
use warnings;
use utf8;
use Digest::MD5 qw(md5_hex);
use Encode qw(encode_utf8 decode_utf8);

my ($in, $page, $comp, $outdir, $catfile, $scopefile) = @ARGV;
die "usage: design2react.pl <in> <page> <Component> <outdir> <catalogue.json> [scopes.ts]\n" unless $catfile;

open my $fh, '<:raw', $in or die "read $in: $!";
my $src = decode_utf8(do { local $/; <$fh> });
close $fh;
$src =~ s/<script type="text\/x-dc".*\z//s;            # drop the logic class
$src =~ s/<template\b.*?<\/template>//gs;                 # bundler thumbnail etc.
$src =~ s/<!--.*?-->//gs;

# ---------------------------------------------------------------- helmet CSS
my $css = '';
if ($src =~ s/<helmet>(.*?)<\/helmet>//s) {
  my $h = $1;
  while ($h =~ /<style[^>]*>(.*?)<\/style>/gs) { $css .= $1 . "\n"; }
}
$css =~ s{/\*.*?\*/}{}gs;
my $scope = "html.pg-$page";
$css = scope_css($css, $scope);

# ---------------------------------------------------------------- tokenise
my @tok;   # [type, data...]: ['open', tag, attrs(arrayref of [name,val|undef]), selfclose] / ['close', tag] / ['text', str]
while (length $src) {
  if ($src =~ s/^<\/([a-zA-Z][\w:-]*)\s*>//) { push @tok, ['close', lc $1]; next; }
  if ($src =~ s/^<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>//s) {
    my ($tag, $attrs, $sc) = ($1, $2, $3);
    my @a;
    while ($attrs =~ /\s+([^\s=>\/]+)(?:\s*=\s*"([^"]*)")?/gs) { push @a, [$1, defined $2 ? $2 : undef]; }
    push @tok, ['open', $tag, \@a, $sc ? 1 : 0];
    next;
  }
  if ($src =~ s/^<!DOCTYPE[^>]*>//i) { next; }
  if ($src =~ s/^([^<]+)//s) { push @tok, ['text', $1]; next; }
  if ($src =~ s/^<//) { push @tok, ['text', '<']; next; }
}

# ---------------------------------------------------------------- build tree
my %VOID = map { $_ => 1 } qw(input img br meta link hr area base col source track wbr image-slot);
my %SKIP = map { $_ => 1 } qw(html head body x-dc script style link meta);
my $root = { tag => '#root', kids => [] };
my @stack = ($root);
for my $t (@tok) {
  if ($t->[0] eq 'open') {
    my $n = { tag => $t->[1], attrs => $t->[2], kids => [] };
    push @{ $stack[-1]{kids} }, $n;
    push @stack, $n unless $t->[3] || $VOID{ lc $t->[1] };
  } elsif ($t->[0] eq 'close') {
    my $tag = $t->[1];
    for (my $i = $#stack; $i > 0; $i--) {
      if (lc($stack[$i]{tag}) eq $tag) { splice @stack, $i; last; }
    }
  } else {
    push @{ $stack[-1]{kids} }, { text => $t->[1] };
  }
}

# ---------------------------------------------------------------- emit
my %cat;          # key -> text
my @hover;        # css rules
my $hoverN = 0;
my @loopvars;     # names in scope from sc-for
my @scopes;       # display holes of ancestor elements ("bSecDisp"): wording inside belongs to that part
my %scope;        # key -> "bSecDisp,rideDisp"

sub decode_entities {
  my $s = shift;
  my %e = (amp => '&', lt => '<', gt => '>', quot => '"', apos => "'", nbsp => "\x{a0}", middot => "\x{b7}",
           hellip => "\x{2026}", ndash => "\x{2013}", mdash => "\x{2014}", rsquo => "\x{2019}", lsquo => "\x{2018}",
           rdquo => "\x{201d}", ldquo => "\x{201c}", times => "\x{d7}", copy => "\x{a9}", eacute => "\x{e9}", rarr => "\x{2192}", larr => "\x{2190}", darr => "\x{2193}");
  $s =~ s/&#x([0-9a-fA-F]+);/chr(hex $1)/ge;
  $s =~ s/&#(\d+);/chr($1)/ge;
  $s =~ s/&([a-zA-Z]+);/exists $e{$1} ? $e{$1} : "&$1;"/ge;
  return $s;
}

sub js_str {    # JSON-style string literal, ASCII-only (non-ASCII as \u escapes)
  my $s = shift;
  $s =~ s/\\/\\\\/g; $s =~ s/"/\\"/g; $s =~ s/\n/\\n/g; $s =~ s/\r//g; $s =~ s/\t/\\t/g;
  $s =~ s/([^\x20-\x7e])/sprintf('\\u%04x', ord $1)/ge;
  return qq{"$s"};
}
sub tpl_str {   # template-literal body, ASCII-only
  my $s = shift;
  $s =~ s/\\/\\\\/g; $s =~ s/`/\\`/g; $s =~ s/\$\{/\\\${/g; $s =~ s/\n/\\n/g; $s =~ s/\r//g;
  $s =~ s/([^\x20-\x7e])/sprintf('\\u%04x', ord $1)/ge;
  return $s;
}

sub expr {      # "name" or "item.field" -> JS expression
  my $x = shift;
  $x =~ s/^\s+|\s+$//g;
  return $x if $x =~ /^(true|false|null)$/;
  my ($head) = split /\./, $x;
  return (grep { $_ eq $head } @loopvars) ? $x : "v.$x";
}

sub key_for {
  my ($text) = @_;
  my $k = "$page." . substr(md5_hex(encode_utf8($text)), 0, 8);
  $cat{$k} = $text;
  $scope{$k} //= join(',', @scopes) if @scopes;
  return $k;
}

# attribute value with {{ }} holes -> JSX attribute value
sub attr_value {
  my ($v) = @_;
  $v = decode_entities($v);
  return '{' . expr($1) . '}' if $v =~ /^\s*\{\{\s*([\w.]+)\s*\}\}\s*$/;
  if ($v =~ /\{\{/) {
    my $out = '';
    for my $part (split /(\{\{\s*[\w.]+\s*\}\})/, $v) {
      if ($part =~ /^\{\{\s*([\w.]+)\s*\}\}$/) { $out .= '${' . expr($1) . '}'; }
      else { $out .= tpl_str($part); }
    }
    return '{`' . $out . '`}';
  }
  return '{' . js_str($v) . '}';
}

sub style_value {
  my ($v) = @_;
  my $a = attr_value($v);
  return '{sx(' . substr($a, 1, -1) . ')}';
}

sub camel { my $s = shift; $s =~ s/-([a-z])/uc $1/ge; return $s; }

my %ATTR = (class => 'className', for => 'htmlFor', tabindex => 'tabIndex', autocomplete => 'autoComplete',
            maxlength => 'maxLength', readonly => 'readOnly', crossorigin => 'crossOrigin', playsinline => 'playsInline',
            colspan => 'colSpan', rowspan => 'rowSpan', 'xlink:href' => 'xlinkHref', srcset => 'srcSet', frameborder => 'frameBorder',
            allowfullscreen => 'allowFullScreen');
my %WORDY = map { $_ => 1 } qw(placeholder aria-label alt title);
my %EVENT_PLAIN = map { $_ => 1 } qw(onClick onChange onInput onKeyDown onScroll onSubmit onBlur onFocus);

sub attrs_out {
  my ($tag, $attrs) = @_;
  my @out;
  my @classes;
  for my $at (@$attrs) {
    my ($n, $v) = @$at;
    next if $n =~ /^hint-placeholder/;
    next if $n eq 'xmlns';
    if (!defined $v) { push @out, ($ATTR{lc $n} // $n); next; }
    if ($n eq 'style') { push @out, 'style=' . style_value($v); next; }
    if ($n eq 'style-hover') {
      my $c = "hv-$page-" . (++$hoverN);
      my $decl = join(';', map { my $d = $_; $d =~ s/^\s+|\s+$//g; length $d ? "$d !important" : () } split /;/, decode_entities($v));
      push @hover, ".$c:hover{$decl}";
      push @classes, $c;
      next;
    }
    if ($n eq 'class') { push @classes, $v; next; }
    my $name = $n;
    if ($n =~ /^sc-camel-(.+)$/) { $name = camel($1); }
    elsif ($EVENT_PLAIN{$n}) { $name = $n; }
    elsif (exists $ATTR{lc $n}) { $name = $ATTR{lc $n}; }
    elsif ($n =~ /^(data|aria)-/) { $name = $n; }
    elsif ($n =~ /-/) { $name = camel($n); }
    # Links are content too (registry, maps, bookings, phone numbers): the couple can change them.
    if ($n eq 'href' && $v !~ /\{\{/ && $v =~ /^(https?:|mailto:|tel:)/) {
      push @out, "href={t(" . js_str(key_for(decode_entities($v))) . ')}';
      next;
    }
    if ($WORDY{$n} && $v !~ /\{\{/ && $v =~ /\S/) {
      push @out, "$name={t(" . js_str(key_for(norm_text(decode_entities($v)))) . ')}';
      next;
    }
    # React types these as numbers.
    if ($name =~ /^(tabIndex|rows|cols|maxLength|minLength|colSpan|rowSpan|size|span)$/ && $v =~ /^-?\d+$/) {
      push @out, "$name={$v}";
      next;
    }
    push @out, "$name=" . attr_value($v);
  }
  push @out, 'className=' . js_str(join ' ', @classes) if @classes;
  return @out ? ' ' . join(' ', @out) : '';
}

sub norm_text { my $s = shift; $s =~ s/\s+/ /g; return $s; }

my %NO_WS_INSIDE = map { $_ => 1 } qw(select sc-raw-select svg g defs filter pattern ul ol table tbody thead tr option mask clipPath linearGradient radialGradient);

sub emit {
  my ($node, $ind, $parent) = @_;
  my $pad = '  ' x $ind;
  if (exists $node->{text}) {
    my $raw = $node->{text};
    if ($raw !~ /\S/) {
      return '' if $NO_WS_INSIDE{ $parent // '' };
      return $pad . "{\" \"}\n";
    }
    my $out = '';
    for my $part (split /(\{\{\s*[\w.]+\s*\}\})/, $raw) {
      next if $part eq '';
      if ($part =~ /^\{\{\s*([\w.]+)\s*\}\}$/) { $out .= $pad . '{' . expr($1) . "}\n"; next; }
      my $text = norm_text(decode_entities($part));
      next if $text eq '';
      if ($text !~ /\S/) { $out .= $pad . "{\" \"}\n"; next; }
      if ($text =~ /^[\s\d.,:;!?()\-\x{2013}\x{2014}\x{b7}\x{2022}\/&+*#%]*$/ ) {   # pure punctuation/numbers: no words to translate
        $out .= $pad . '{' . js_str($text) . "}\n"; next;
      }
      $out .= $pad . '{t(' . js_str(key_for($text)) . ")}\n";
    }
    return $out;
  }
  my $tag = $node->{tag};
  my $ltag = lc $tag;
  if ($ltag eq '#root' || $SKIP{$ltag}) {
    return join '', map { emit($_, $ind, $parent) } @{ $node->{kids} } if $ltag eq '#root' || $ltag =~ /^(html|body|x-dc)$/;
    return '';
  }
  my %a = map { ($_->[0] => $_->[1]) } @{ $node->{attrs} };
  if ($ltag eq 'sc-if') {
    my ($cond) = ($a{value} // '') =~ /\{\{\s*([\w.]+)\s*\}\}/;
    my $inner = join '', map { emit($_, $ind + 2, $parent) } @{ $node->{kids} };
    return "$pad\{" . expr($cond) . " ? (\n$pad  <>\n$inner$pad  </>\n$pad) : null}\n";
  }
  if ($ltag eq 'sc-for') {
    my ($list) = ($a{list} // '') =~ /\{\{\s*([\w.]+)\s*\}\}/;
    my $as = $a{as} // 'item';
    my $lexpr = expr($list);
    push @loopvars, $as;
    my $inner = join '', map { emit($_, $ind + 2, $parent) } @{ $node->{kids} };
    pop @loopvars;
    return "$pad\{($lexpr ?? []).map(($as: any, ${as}_i: number) => (\n$pad  <Fragment key={${as}_i}>\n$inner$pad  </Fragment>\n$pad))}\n";
  }
  my $out_tag = $tag;
  my @attrs = @{ $node->{attrs} };
  if ($ltag eq 'sc-raw-select') { $out_tag = 'select'; }
  if ($ltag eq 'image-slot') {
    $out_tag = 'img';
    my @na;
    my $style = '';
    for my $at (@attrs) {
      my ($n, $v) = @$at;
      if ($n eq 'id') { push @na, ['src', "{{ __img_$v }}"]; next; }
      next if $n =~ /^(src|shape)$/;
      if ($n eq 'mask') { $style .= "clip-path:$v;"; next; }
      if ($n eq 'placeholder') { push @na, ['alt', $v]; next; }
      if ($n eq 'style') { $style = $v . ';' . $style; next; }
      push @na, $at;
    }
    push @na, ['style', $style . 'object-fit:cover;display:block'];
    @attrs = @na;
  }
  # An element shown or hidden per guest (style display:{{ bSecDisp }}): its wording belongs to that part.
  my ($disp) = map { ($_->[1] // '') =~ /display:\s*\{\{\s*(\w+)\s*\}\}/ ? $1 : () } grep { $_->[0] eq 'style' } @attrs;
  push @scopes, $disp if $disp;
  my $attr_s = attrs_out($ltag, \@attrs);
  $attr_s =~ s/\{v\.__img_(\w+)\}/'{v.image(' . js_str($1) . ')}'/ge;
  if ($VOID{$ltag} || !@{ $node->{kids} }) {
    pop @scopes if $disp;
    return "$pad<$out_tag$attr_s />\n";
  }
  my $inner = join '', map { emit($_, $ind + 1, $ltag) } @{ $node->{kids} };
  pop @scopes if $disp;
  return "$pad<$out_tag$attr_s>\n$inner$pad</$out_tag>\n";
}

my $body = emit($root, 3, undef);

# ---------------------------------------------------------------- write
my $rel = $in; $rel =~ s{.*[\\/](design[\\/])}{$1};
my $tsx = <<"TSX";
/* AUTO-GENERATED by tools/design2react.pl from $rel. Do not edit by hand:
   change the design file and re-run the converter (see tools/README.md). */
import { Fragment } from 'react';
import { sx } from '../sx';
import type { ViewProps } from '../types';
import './$comp.css';

export function $comp({ v, t }: ViewProps) {
  return (
    <>
$body    </>
  );
}
TSX
open my $o, '>:raw', "$outdir/$comp.tsx" or die $!; print $o encode_utf8($tsx); close $o;
open my $c, '>:raw', "$outdir/$comp.css" or die $!;
print $c encode_utf8("/* AUTO-GENERATED by tools/design2react.pl from $rel */\n$css\n" . join("\n", @hover) . "\n"); close $c;

# merge into the catalogue (keeps other pages' keys)
my %all;
if (-e $catfile) {
  open my $cf, '<:raw', $catfile or die $!;
  my $j = decode_utf8(do { local $/; <$cf> });
  close $cf;
  while ($j =~ /"((?:[^"\\]|\\.)+)":\s*"((?:[^"\\]|\\.)*)"/g) { my ($k, $v) = ($1, $2); $all{$k} = unjson($v) unless $k =~ /^\Q$page\E\./; }
}
$all{$_} = $cat{$_} for keys %cat;
open my $co, '>:raw', $catfile or die $!;
print $co "{\n" . join(",\n", map { '  ' . js_str($_) . ': ' . js_str($all{$_}) } sort keys %all) . "\n}\n";
close $co;
if ($scopefile) {   # which wording belongs to a per-guest part (the server leaves it out for guests it doesn't apply to)
  my $name = uc($page) . '_SCOPES';
  my $body = join(",\n", map { '  ' . js_str($_) . ': ' . js_str($scope{$_}) } sort keys %scope);
  open my $so, '>:raw', $scopefile or die $!;
  print $so "/* AUTO-GENERATED by tools/design2react.pl from $rel: catalogue key -> the design value that shows or hides it. */\nexport const $name: Record<string, string> = {\n$body\n};\n";
  close $so;
}
printf STDERR "%s: %d text keys (%d per-guest), %d hover rules\n", $comp, scalar(keys %cat), scalar(keys %scope), scalar(@hover);

sub unjson {
  my $s = shift;
  $s =~ s/\\u([0-9a-fA-F]{4})/chr(hex $1)/ge;
  $s =~ s/\\n/\n/g; $s =~ s/\\t/\t/g; $s =~ s/\\"/"/g; $s =~ s/\\\\/\\/g;
  return $s;
}

sub scope_css {
  my ($css, $scope) = @_;
  my $out = '';
  # keep @keyframes blocks as they are; prefix plain rules with the page scope
  while ($css =~ /\G\s*(\@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*\s*\}|[^{}]+\{[^{}]*\})/gc) {
    my $r = $1;
    if ($r =~ /^\@keyframes/) { $out .= "$r\n"; next; }
    my ($sel, $decl) = $r =~ /^([^{]+)\{(.*)\}$/s;
    my @s = map {
      my $x = $_; $x =~ s/^\s+|\s+$//g;
      $x eq 'html' ? $scope : $x eq 'body' ? "$scope body" : $x =~ /^(html|body)\b(.*)/ ? ($1 eq 'html' ? "$scope$2" : "$scope body$2") : "$scope $x";
    } split /,/, $sel;
    $out .= join(',', @s) . "{$decl}\n";
  }
  return $out;
}
