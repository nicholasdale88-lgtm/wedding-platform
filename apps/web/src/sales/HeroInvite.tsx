/**
 * The front page's moving picture: a phone where the wax-sealed envelope opens by itself, the invitation
 * rises out, and the guest taps Yes. It loops every 12 seconds (still, with the card showing, for anyone
 * who prefers less motion). Pure CSS: nothing to load.
 */

const INK = '#33402f';
const GOLD = '#c8a46a';
const SEAL = '#9e4f33';
const serif = "'Cormorant Garamond', Georgia, serif";

const CSS = `
.hi-phone{position:relative;width:286px;height:580px;border-radius:44px;padding:12px;background:#151a13;box-shadow:0 40px 80px rgba(0,0,0,.45),inset 0 0 0 2px #3a4236}
.hi-screen{position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;background:radial-gradient(120% 80% at 50% 0%,#fbf8f2,#efe6d3)}
.hi-notch{position:absolute;top:8px;left:50%;width:86px;height:22px;margin-left:-43px;border-radius:12px;background:#151a13;z-index:9}
.hi-to{position:absolute;top:92px;left:0;right:0;text-align:center;font-family:${serif};font-size:20px;color:${INK};animation:hiFade 12s infinite}
.hi-env{position:absolute;left:23px;right:23px;top:200px;aspect-ratio:3/2;perspective:800px}
.hi-back{position:absolute;inset:0;border-radius:6px;background:#e6dcc4;box-shadow:0 16px 30px rgba(51,64,47,.22)}
.hi-card{position:absolute;left:6%;right:6%;top:6%;height:190%;border-radius:6px;background:#fffdf8;box-shadow:0 10px 26px rgba(51,64,47,.18);
  display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 12px;text-align:center;color:${INK};animation:hiCard 12s infinite;z-index:1}
.hi-front{position:absolute;inset:0;border-radius:6px;background:linear-gradient(160deg,#ece3cd,#e0d3b4);clip-path:polygon(0 0,50% 58%,100% 0,100% 100%,0 100%);z-index:2;animation:hiDrop 12s infinite}
.hi-flap{position:absolute;left:0;right:0;top:0;height:62%;transform-origin:top;z-index:3;animation:hiFlap 12s infinite}
.hi-flap::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#efe6d1,#d9cba9);clip-path:polygon(0 0,100% 0,50% 100%)}
.hi-backwrap{animation:hiDrop 12s infinite}
.hi-seal{position:absolute;left:50%;top:62%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;z-index:4;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 35% 30%,#c06a48,${SEAL} 60%,#7d3a24);box-shadow:0 3px 8px rgba(60,20,10,.35);color:#f6e2d2;font-family:${serif};font-size:18px;animation:hiSeal 12s infinite}
.hi-yes{margin-top:6px;padding:7px 22px;border-radius:999px;background:${INK};color:#fbf8f2;font-size:13px;animation:hiTap 12s infinite}
.hi-done{position:absolute;left:18px;right:18px;bottom:26px;padding:10px 12px;border-radius:14px;background:${INK};color:#fbf8f2;font-size:13px;text-align:center;animation:hiToast 12s infinite;z-index:6}
@keyframes hiSeal{0%,12%{transform:none;opacity:1}22%{transform:translateY(-160px) rotate(-40deg) scale(1.4);opacity:0}96%{opacity:0;transform:none}100%{opacity:1}}
@keyframes hiFlap{0%,16%{transform:none;z-index:3}28%{transform:rotateX(180deg);z-index:0}92%{transform:rotateX(180deg);z-index:0}100%{transform:none;z-index:3}}
@keyframes hiCard{0%,26%{transform:translateY(0)}42%,90%{transform:translateY(-58%)}100%{transform:translateY(0)}}
@keyframes hiDrop{0%,34%{transform:none}46%,90%{transform:translateY(150px)}100%{transform:none}}
@keyframes hiFade{0%,20%{opacity:1}30%,92%{opacity:0}100%{opacity:1}}
@keyframes hiTap{0%,58%{transform:none;box-shadow:none}61%{transform:scale(.92);box-shadow:0 0 0 6px rgba(200,164,106,.45)}64%,100%{transform:none;box-shadow:none}}
@keyframes hiToast{0%,63%{opacity:0;transform:translateY(12px)}68%,88%{opacity:1;transform:none}94%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.hi-seal,.hi-flap,.hi-card,.hi-front,.hi-backwrap,.hi-to,.hi-yes,.hi-done{animation:none}
  .hi-seal,.hi-to{opacity:0}.hi-flap{transform:rotateX(180deg);z-index:0}.hi-card{transform:translateY(-58%)}.hi-front,.hi-backwrap{transform:translateY(150px)}}
`;

export function HeroInvite() {
  return (
    <div className="hi-phone" role="img" aria-label="A wax-sealed invitation opening on a phone, and the guest tapping Yes">
      <style>{CSS}</style>
      <div className="hi-screen">
        <span className="hi-notch" />
        <span className="hi-to">For Jo &amp; Chris</span>
        <div className="hi-env">
          <span className="hi-backwrap absolute inset-0">
            <span className="hi-back" />
          </span>
          <span className="hi-card">
            <span style={{ fontSize: 10, letterSpacing: '.25em', textTransform: 'uppercase', color: GOLD }}>Together with their families</span>
            <span style={{ fontFamily: serif, fontSize: 30, lineHeight: 1.05 }}>
              Alex
              <br />
              &amp; Sam
            </span>
            <span style={{ fontSize: 12 }}>Saturday 13 March · 3pm</span>
            <span style={{ fontSize: 11, opacity: 0.75 }}>The Old Dairy, Kangaroo Valley</span>
            <span className="hi-yes">Yes, we’ll be there</span>
          </span>
          <span className="hi-front" />
          <span className="hi-flap" />
          <span className="hi-seal">A&amp;S</span>
        </div>
        <span className="hi-done">✓ Jo &amp; Chris are coming. Chris is vegetarian.</span>
      </div>
    </div>
  );
}
