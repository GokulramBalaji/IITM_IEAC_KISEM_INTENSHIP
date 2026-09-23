import json, urllib.request, http.cookiejar
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
req = urllib.request.Request('http://localhost:3001/api/login', data=json.dumps({'email':'admin','password':'admin'}).encode(), headers={'Content-Type':'application/json'})
with op.open(req) as r:
    print('LOGIN', r.status)
    print(r.read().decode())
req2 = urllib.request.Request('http://localhost:3001/api/admin/clear-bookings', data=json.dumps({'start': None, 'end': None}).encode(), headers={'Content-Type':'application/json'})
with op.open(req2) as r2:
    print('CLEAR', r2.status)
    print(r2.read().decode())
