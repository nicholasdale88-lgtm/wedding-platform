"""
QA test accounts (YL-09): one couple and one vendor, for Sentinel's retests.

Run it yourself, once, from this folder:

    python make_qa_accounts.py                 # the live site
    python make_qa_accounts.py http://localhost:5173

It signs up a test couple (Harriet & Theo, QA) and a test vendor (QA Florals) through the site's own sign-up
pages, each with a fresh random passcode, and writes the emails and passcodes to qa-accounts.local.json next
to this file. That file is never committed (.gitignore: *.local.json) and the passcodes are never printed:
hand the file to QA privately. Nothing is deleted or changed; it only adds the two accounts. Running it again
makes two more (new emails), so keep the file.
"""
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://wedding-platform-nd.pages.dev').rstrip('/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qa-accounts.local.json')
stamp = time.strftime('%Y%m%d%H%M')


def passcode():
    # Four random words' worth of letters and digits: long, no look-alikes.
    alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
    return '-'.join(''.join(secrets.choice(alphabet) for _ in range(5)) for _ in range(4))


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={'content-type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


if os.path.exists(OUT):
    sys.exit(f'{OUT} already exists: those accounts are already made. Move it away to make new ones.')

couple = {'email': f'qa-couple-{stamp}@example.com', 'passcode': passcode()}
status, res = post('/api/a/signup', {'firstName': 'Harriet', 'partnerName': 'Theo', 'email': couple['email'], 'passcode': couple['passcode'], 'date': '2027-03-20', 'guests': 80, 'plan': 'complete', 'marketing': False, 'website': ''})
if status != 200:
    sys.exit(f'Couple sign-up failed: {status} {res.get("error", {}).get("message", "")}')
couple['weddingId'] = res.get('weddingId', '')


def save(vendor=None):
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'site': BASE, 'made': time.strftime('%Y-%m-%d %H:%M'), 'couple': {**couple, 'signIn': f'{BASE}/admin'}, 'vendor': {**vendor, 'signIn': f'{BASE}/vendors/me'} if vendor else None}, f, indent=2)


save()  # the couple is kept even if the vendor's sign-up fails

vendor = {'email': f'qa-vendor-{stamp}@example.com', 'passcode': passcode()}
status, res = post('/api/directory/join', {'name': f'QA Florals {stamp}', 'category': 'florist', 'region': 'sydney', 'regions': [], 'contactName': 'QA', 'phone': '', 'website': '', 'instagram': '', 'about': '', 'priceFrom': 0, 'photos': [], 'email': vendor['email'], 'passcode': vendor['passcode'], 'company': ''})
if status != 200:
    sys.exit(f'Vendor sign-up failed: {status} {res.get("error", {}).get("message", "")} (the couple was made and is in {OUT})')

save(vendor)
print(f'Made a test couple and a test vendor on {BASE}. Their emails and passcodes are in {OUT} (not committed).')
