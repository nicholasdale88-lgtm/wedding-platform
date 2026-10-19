-- One-time (2026-10-19): the preview bar's note carried a design comment ("Hidden when showPreviewBar is off").
UPDATE wedding
   SET content = json_set(content, '$.texts."inv.0350ada2"', 'Each guest gets a personal link, so they land here already matched to their invitation.'),
       version = version + 1
 WHERE json_valid(content)
   AND json_extract(content, '$.texts."inv.0350ada2"') LIKE '%showPreviewBar%';
