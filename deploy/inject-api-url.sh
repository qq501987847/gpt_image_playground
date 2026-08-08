#!/bin/sh

fail_release_config() {
    echo "AWAI Web 发布配置无效：$1" >&2
    exit 1
}

require_https_url() {
    name=$1
    value=$2
    case "$value" in
        https://?*) ;;
        *) fail_release_config "$name 必须是 HTTPS URL" ;;
    esac
    case "$value" in
        *'*'*|*' '*) fail_release_config "$name 不能包含通配符或空格" ;;
    esac
}

require_https_url AWAI_SUPPORT_URL "$AWAI_SUPPORT_URL"
require_https_url AWAI_ASSET_SERVICE_URL "$AWAI_ASSET_SERVICE_URL"
case "${AWAI_ASSET_SERVICE_URL#https://}" in
    *'/'*|*'?'*|*'#'*|*'@'*) fail_release_config "AWAI_ASSET_SERVICE_URL 必须是精确 HTTPS origin" ;;
esac

old_ifs=$IFS
IFS=,
for origin in $AWAI_SUB2API_ALLOWED_ORIGINS; do
    require_https_url AWAI_SUB2API_ALLOWED_ORIGINS "$origin"
    case "${origin#https://}" in
        *'/'*|*'?'*|*'#'*|*'@'*) fail_release_config "AWAI_SUB2API_ALLOWED_ORIGINS 必须只包含精确 HTTPS origin" ;;
    esac
done
IFS=$old_ifs
[ -n "$AWAI_SUB2API_ALLOWED_ORIGINS" ] || fail_release_config "缺少 AWAI_SUB2API_ALLOWED_ORIGINS"

# 用环境变量替换前端默认 API URL。显式传入空字符串时保留为空。
if [ "${DEFAULT_API_URL+x}" != "x" ]; then
    DEFAULT_API_URL=${API_URL:-https://api.openai.com/v1}
fi
DOCKER_LEGACY_API_URL_USED=${DOCKER_LEGACY_API_URL_USED:-false}
if [ -n "$API_URL" ]; then
    DOCKER_LEGACY_API_URL_USED=true
fi

API_PROXY_AVAILABLE=false
if [ "$ENABLE_API_PROXY" = "true" ]; then
    API_PROXY_AVAILABLE=true
fi

API_PROXY_LOCKED=false
if [ "$ENABLE_API_PROXY" = "true" ] && [ "$LOCK_API_PROXY" = "true" ]; then
    API_PROXY_LOCKED=true
fi

DEFAULT_CONFIG_ONLY=false
if [ "$SHOW_DEFAULT_CONFIG_ONLY" = "true" ]; then
    DEFAULT_CONFIG_ONLY=true
fi

escape_sed_replacement() {
    printf '%s' "$1" | sed 's/[&|\\]/\\&/g'
}

escape_js_string() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

DEFAULT_API_URL_ESCAPED=$(escape_sed_replacement "$(escape_js_string "$DEFAULT_API_URL")")
AWAI_SUB2API_ALLOWED_ORIGINS_ESCAPED=$(escape_sed_replacement "$(escape_js_string "$AWAI_SUB2API_ALLOWED_ORIGINS")")
AWAI_SUPPORT_URL_ESCAPED=$(escape_sed_replacement "$(escape_js_string "$AWAI_SUPPORT_URL")")
AWAI_ASSET_SERVICE_URL_ESCAPED=$(escape_sed_replacement "$(escape_js_string "$AWAI_ASSET_SERVICE_URL")")

# 查找所有 js 文件并将占位符替换为运行时配置
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_DEFAULT_API_URL_PLACEHOLDER__|$DEFAULT_API_URL_ESCAPED|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_API_PROXY_AVAILABLE_PLACEHOLDER__|$API_PROXY_AVAILABLE|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_API_PROXY_LOCKED_PLACEHOLDER__|$API_PROXY_LOCKED|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_DOCKER_DEPLOYMENT_PLACEHOLDER__|true|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_DOCKER_LEGACY_API_URL_USED_PLACEHOLDER__|$DOCKER_LEGACY_API_URL_USED|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_SHOW_DEFAULT_CONFIG_ONLY_PLACEHOLDER__|$DEFAULT_CONFIG_ONLY|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_AWAI_SUB2API_ALLOWED_ORIGINS_PLACEHOLDER__|$AWAI_SUB2API_ALLOWED_ORIGINS_ESCAPED|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_AWAI_SUPPORT_URL_PLACEHOLDER__|$AWAI_SUPPORT_URL_ESCAPED|g" {} +
find /usr/share/nginx/html/assets -type f -name "*.js" -exec sed -i "s|__VITE_AWAI_ASSET_SERVICE_URL_PLACEHOLDER__|$AWAI_ASSET_SERVICE_URL_ESCAPED|g" {} +

# 检查是否启用了 API 代理
if [ "$ENABLE_API_PROXY" != "true" ]; then
    # 删除代理配置块
    sed -i '/# BEGIN API PROXY/,/# END API PROXY/d' /etc/nginx/conf.d/default.conf
fi

exec "$@"
