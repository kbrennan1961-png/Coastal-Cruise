FROM debian:bookworm-slim AS source

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git git-lfs \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Cache buster: GitHub sets Last-Modified on this endpoint to the latest
# commit date, so a new push invalidates the git clone layer below.
ADD https://api.github.com/repos/kbrennan1961-png/Coastal-Cruise/commits/main /tmp/github-commit.json

ARG REPO_URL=https://github.com/kbrennan1961-png/Coastal-Cruise.git
WORKDIR /src
RUN git clone --depth 1 "$REPO_URL" . \
    && git lfs pull \
    && rm -rf /src/.git

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=source /src/ /usr/share/nginx/html/

RUN mkdir -p /var/cache/nginx && chown -R nginx:nginx /var/cache/nginx

USER nginx
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
