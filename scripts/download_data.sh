#!/bin/bash

function request_json() {
    local json_name="$1"
    local splatoon_ink_api='https://splatoon3.ink/data'
    local curl_user_agent='User-Agent: Splatoon3 Bot (https://github.com/tenvili)'
    echo "download \"$splatoon_ink_api/$json_name.json\" start."
    curl -H "$curl_user_agent" -L -S -s "$splatoon_ink_api/$json_name.json" >"data/$json_name.json"
    echo "download \"$splatoon_ink_api/$json_name.json\" succeeded."
}

find data -name '*.json' -type f -print -exec rm -rf {} \;

request_json "schedules"
request_json "gear"
request_json "festivals"
request_json "coop"
request_json "locale/zh-CN"
request_json "locale/en-US"

# if [[ -e locale/zh-CN.json ]]; then
#     echo "skip download \"locale/zh-CN.json\", use cache."
# else
#     request_json "locale/zh-CN"
# fi

ls -R data
