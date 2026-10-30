#!/usr/bin/env bash
# Only manages moonveil-games and the new, independently owned paths below.
set -Eeuo pipefail
umask 077
mode=${1:-}
base=/opt/games
config=/etc/games
unit=/etc/systemd/system/moonveil-games.service
site=/etc/nginx/conf.d/moonveil-games.conf
data=/var/lib/games
account=moonveil-games
unit_added=0
site_added=0
nginx_reloaded=0
scratch=
stage=
password=

die() { printf '停止：%s\n' "$*" >&2; exit 1; }
cleanup() {
  rc=$?
  trap - EXIT
  unset password confirm password_hash
  if [[ -n $scratch ]]; then rm -f -- "$scratch"; fi
  if [[ -n $stage && -d $stage ]]; then rm -rf -- "$stage"; fi
  if (( rc != 0 )); then
    printf '\n部署未完成，未宣告成功。不会继续重启其他服务。\n' >&2
    if [[ $mode == install ]]; then
      # Remove only files/services that this invocation newly created.
      if (( site_added )); then rm -f -- "$site"; fi
      if (( nginx_reloaded )); then
        if nginx -t; then systemctl reload nginx || true; fi
      fi
      if (( unit_added )); then systemctl disable --now moonveil-games.service || true; fi
    else
      printf '若已切换版本，请执行：sudo bash /opt/games/current/deploy/manage.sh rollback\n' >&2
    fi
  fi
  exit "$rc"
}
trap cleanup EXIT
[[ $EUID == 0 ]] || die '请以 root 或 sudo bash 执行'
[[ $mode == install || $mode == update || $mode == rollback ]] || die '使用 install、update 或 rollback'
for tool in nginx openssl curl python3 ss systemctl systemd-analyze runuser sha256sum realpath; do
  command -v "$tool" >/dev/null || die "缺少工具：$tool（未自动更改系统软件）"
done
nginx -t
systemctl is-active --quiet nginx || die '现有 Nginx 未运行，未作任何修复'
systemctl is-active --quiet nature-photo || die '自然图鉴当前未运行，请先检查现有项目'
photo_pid=$(systemctl show nature-photo -p MainPID --value)
printf '=== 资源与已有端口（只读） ===\n'
df -h /opt /var
free -h
ss -lnt
available_kb=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
[[ $available_kb =~ ^[0-9]+$ ]] && (( available_kb >= 262144 )) || die '可用内存不足 256 MiB'
free_kb=$(df -Pk /opt | awk 'END {print $4}')
(( free_kb >= 131072 )) || die '/opt 可用空间不足 128 MiB'
nginx -T 2>/dev/null | grep -E '^[[:space:]]*include[[:space:]]+/etc/nginx/conf\.d/\*\.conf;' >/dev/null || die 'Nginx 未使用标准 conf.d/*.conf 引入，需单独检查'

valid_release() {
  [[ -d $1 && ! -L $1 && -f $1/RELEASE_SHA && -f $1/dist/index.html && -f $1/server/index.js ]] || return 1
  local name
  name=$(basename "$1")
  [[ $name =~ ^[0-9a-f]{40}$ && $(cat "$1/RELEASE_SHA") == "$name" && $(realpath "$1") == "$base/releases/$name" ]]
}
switch_to() {
  local target=$1 label=$2
  local linkdir
  linkdir=$(mktemp -d "$base/.link-XXXXXX")
  ln -s "$target" "$linkdir/link"
  mv -Tf "$linkdir/link" "$base/$label"
  rmdir "$linkdir"
}
health() {
  local expected=$1
  local ready=0
  scratch=$(mktemp /tmp/moonveil-health-XXXXXX)
  for (( attempt=0; attempt<20; attempt++ )); do
    if curl --noproxy '*' -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3201/api/health -o "$scratch" 2>/dev/null; then
      if python3 - "$scratch" "$expected" <<'PY'
import json, sys
try:
    body=json.load(open(sys.argv[1]))
    sys.exit(0 if body.get('ok') is True and body.get('version') == sys.argv[2] else 1)
except (OSError, ValueError):
    sys.exit(1)
PY
      then ready=1; break; fi
    fi
    sleep 0.5
  done
  rm -f "$scratch"; scratch=
  (( ready )) || { journalctl -u moonveil-games -n 25 --no-pager; die '新版本健康检查未通过'; }
  systemctl is-active --quiet moonveil-games || die '新服务未保持运行'
}

if [[ $mode == install ]]; then
  for item in "$base" "$config" "$data" "$unit" "$site"; do
    [[ ! -e $item && ! -L $item ]] || die "$item 已存在，为避免覆盖已停止；请把输出发回检查"
  done
  ! getent passwd "$account" >/dev/null || die '同名系统账号已存在，未复用'
  ! getent group "$account" >/dev/null || die '同名系统组已存在，未复用'
  unit_state=$(systemctl show moonveil-games.service -p LoadState --value 2>/dev/null || true)
  [[ $unit_state == not-found ]] || die '系统已有同名服务或无法确认状态，未覆盖'
  for port in 3201 8081; do
    [[ -z $(ss -H -ltn "sport = :$port") ]] || die "端口 $port 已被占用；未停止占用者"
  done
  ! nginx -T 2>/dev/null | grep -E '^[[:space:]]*listen[[:space:]]+([^[:space:];]+:)?8081([[:space:];]|$)' >/dev/null || die '已有 Nginx 配置使用 8081；未修改'
else
  [[ -f $unit && -f $site && -f $config/environment && -d $data && -L $base/current ]] || die '尚未完成首次部署'
  grep -Fq 'Description=Moonveil werewolf game' "$unit" || die '同名服务不属于本项目'
  current=$(realpath "$base/current")
  valid_release "$current" || die 'current 不是有效的受管版本目录'
fi

if [[ $mode == rollback ]]; then
  [[ -L $base/previous ]] || die '尚无上一版本可回滚'
  release=$(realpath "$base/previous")
  valid_release "$release" || die 'previous 不是有效的受管版本目录'
  version=$(basename "$release")
else
  [[ $# == 3 && $3 =~ ^[0-9a-f]{40}$ ]] || die '需要源码目录和完整的 40 位提交 SHA'
  source_dir=$(realpath "$2")
  version=$3
  [[ -f $source_dir/deploy/artifacts.sha256 && -f $source_dir/deploy/web/index.html ]] || die '缺少本次预构建文件'
  ( cd "$source_dir"; sha256sum -c deploy/artifacts.sha256 )
  node_bin=$(command -v node) || die '未找到现有 Node.js，请先检查安装路径'
  node_bin=$(realpath "$node_bin")
  [[ $node_bin =~ ^/[A-Za-z0-9_./+-]+$ && $node_bin != /root/* && $node_bin != /home/* ]] || die 'Node 位于受保护的用户目录，不能供独立服务使用'
  "$node_bin" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || die '需要 Node.js 22+，未升级现有运行时'
  "$node_bin" --check "$source_dir/server/index.js"
  "$node_bin" --check "$source_dir/server/game.js"

  if [[ $mode == install ]]; then
    [[ -r /dev/tty && -w /dev/tty ]] || die '需要交互式终端设置访问密码'
    IFS= read -r -s -p '设置新游戏访问密码（至少 8 位，输入不显示）：' password </dev/tty
    printf '\n' >/dev/tty
    IFS= read -r -s -p '再次输入密码：' confirm </dev/tty
    printf '\n' >/dev/tty
    [[ ${#password} -ge 8 && $password == "$confirm" ]] || die '密码长度不足或两次输入不一致'
    password_hash=$(printf '%s' "$password" | openssl passwd -6 -stdin)
    unset confirm
    nginx_user=$(awk '$1=="user" {gsub(/;/,"",$2);print $2;exit}' /etc/nginx/nginx.conf)
    [[ -n $nginx_user ]] || die '无法确认 Nginx worker 用户'
    nginx_group=$(id -gn "$nginx_user")
    groupadd --system "$account"
    useradd --system --gid "$account" --home-dir "$data" --no-create-home --shell /usr/sbin/nologin "$account"
    runuser -u "$account" -- sh -c 'cd / && exec "$1" --version' sh "$node_bin"
    install -d -m 755 "$base" "$base/releases"
    install -d -m 700 -o "$account" -g "$account" "$data"
    install -d -m 750 -o root -g "$nginx_group" "$config"
    install -d -m 700 "$config/tls"
    printf 'games:%s\n' "$password_hash" >"$config/htpasswd"
    unset password_hash
    chown root:"$nginx_group" "$config/htpasswd"
    chmod 640 "$config/htpasswd"
    openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 \
      -keyout "$config/tls/server.key" -out "$config/tls/server.crt" \
      -subj '/CN=123.57.60.66' -addext 'subjectAltName=IP:123.57.60.66,IP:127.0.0.1' 2>/dev/null
    chmod 600 "$config/tls/server.key"
    chmod 644 "$config/tls/server.crt"
    printf 'HOST=127.0.0.1\nPORT=3201\nDATA_DIR=/var/lib/games\n' >"$config/environment"
    chmod 600 "$config/environment"
  fi
  release="$base/releases/$version"
  [[ ! -e $release && ! -L $release ]] || die '此版本目录已存在；未覆盖，可检查当前状态或使用回滚'
  stage=$(mktemp -d "$base/releases/.stage-XXXXXX")
  cp -R "$source_dir/server" "$stage/server"
  cp -R "$source_dir/deploy/web" "$stage/dist"
  cp "$source_dir/package.json" "$stage/package.json"
  mkdir "$stage/deploy"
  cp "$source_dir/deploy/manage.sh" "$source_dir/deploy/check-auth.py" "$stage/deploy/"
  printf '%s\n' "$version" >"$stage/RELEASE_SHA"
  find "$stage" -type d -exec chmod 755 {} +
  find "$stage" -type f -exec chmod 644 {} +
  chown -R root:root "$stage"
  mv "$stage" "$release"
  stage=
fi

if [[ $mode != install ]]; then
  backup_dir="/var/backups/moonveil-games/$(date +%Y%m%dT%H%M%S)-$version"
  install -d -m 700 "$backup_dir"
  if [[ -f $data/rooms.json ]]; then cp -p "$data/rooms.json" "$backup_dir/rooms.json"; fi
  printf '%s\n' "$current" >"$backup_dir/previous-release"
  switch_to "$current" previous
  printf '更新前房间快照：%s（不会自动恢复或覆盖当前业务数据）\n' "$backup_dir"
fi
switch_to "$release" current
if [[ $mode == install ]]; then
  unit_added=1
  sed "s|/usr/bin/node|$node_bin|" "$source_dir/deploy/moonveil-games.service" >"$unit"
  chmod 644 "$unit"
  systemd-analyze verify "$unit"
  systemctl daemon-reload
  systemctl enable --now moonveil-games.service
else
  systemctl restart moonveil-games.service
fi
health "$version"
if [[ $mode == install ]]; then
  site_added=1
  install -m 644 "$source_dir/deploy/nginx.conf" "$site"
  nginx -t
  nginx_reloaded=1
  systemctl reload nginx
  printf '%s' "$password" | python3 "$source_dir/deploy/check-auth.py" "$config/tls/server.crt" "$version"
  unset password
fi
status=$(curl --noproxy '*' --cacert "$config/tls/server.crt" -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' https://127.0.0.1:8081/api/health)
[[ $status == 401 ]] || die "未登录访问应返回 401，实际为 $status"
systemctl is-active --quiet nature-photo || die '现有自然图鉴服务状态异常，请检查'
[[ $(systemctl show nature-photo -p MainPID --value) == "$photo_pid" ]] || die '自然图鉴 PID 期间发生变化，请检查原因'
systemctl is-active --quiet nginx
systemctl is-active --quiet moonveil-games
printf '\n本机部署检查通过：%s\n版本：%s\n用户名：games\n访问地址：https://123.57.60.66:8081\n' "$mode" "$version"
printf '请确认阿里云安全组已放行 TCP 8081。公网可达性仍需浏览器验证。\n'
