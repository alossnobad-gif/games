"""Verify the new proxy without putting the password in argv or environment."""
import base64
import json
import ssl
import sys
import urllib.request

password = sys.stdin.read()
context = ssl.create_default_context(cafile=sys.argv[1])
authorization = 'Basic ' + base64.b64encode(('games:' + password).encode()).decode()
# Local verification must not leave the server through an inherited HTTP proxy.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))
for route in ['/api/health', '/']:
    request = urllib.request.Request('https://127.0.0.1:8081' + route, headers={'Authorization': authorization})
    with opener.open(request, timeout=10) as response:
        body = response.read()
        if route == '/api/health':
            result = json.loads(body)
            assert result['ok'] is True and result['version'] == sys.argv[2], 'Unexpected deployed version'
        else:
            assert '月隐镇'.encode() in body, 'Unexpected homepage'
print('HTTPS、访问密码、健康接口版本及首页检查通过')
