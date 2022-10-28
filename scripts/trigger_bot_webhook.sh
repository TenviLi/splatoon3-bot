#!/bin/bash

if [[ -e "$SCREENSHOT_FILENAME" ]]; then
    echo "screenshot \"$SCREENSHOT_FILENAME\" exists"
else
    echo "screenshot \"$SCREENSHOT_FILENAME\" not found"
    exit 1
fi

export IMAGE_BASE64=$(cat $SCREENSHOT_FILENAME | base64)
export IMAGE_MD5=$(cat $SCREENSHOT_FILENAME | md5sum | cut -d ' ' -f1)

export payload=$(node -e "
  console.log(JSON.stringify({
    msgtype: "image",
    image: {
      base64: "$IMAGE_BASE64",
  	  md5: "$IMAGE_MD5"
    }
  }))
")

echo $payload

curl "$BOT_WEBHOOK_URL" -H 'Content-Type: application/json' -d "$payload"
