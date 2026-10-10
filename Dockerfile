# The caller must supply an approved, immutable base reference, for example
# node:20-alpine@sha256:<verified digest>.  No mutable base tag is embedded here.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# Python is required because the bot registry permits python/python3 as well as node.
RUN apk add --no-cache python3 \
    && addgroup -S -g 10001 arena \
    && adduser -S -D -H -u 10001 -G arena arena \
    && mkdir -p /app \
    && chown arena:arena /app

WORKDIR /app
USER 10001:10001
