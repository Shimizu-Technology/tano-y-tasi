FROM ruby:3.3.14-slim AS build
WORKDIR /app
ENV BUNDLE_WITHOUT="development:test" BUNDLE_DEPLOYMENT="1"
RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 && rm -rf /usr/local/bundle/cache
COPY . .

FROM ruby:3.3.14-slim
WORKDIR /app
ENV RAILS_ENV="production" BUNDLE_WITHOUT="development:test" BUNDLE_DEPLOYMENT="1"
RUN apt-get update -qq && apt-get install --no-install-recommends -y libpq5 postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/* && groupadd --gid 1000 rails && useradd --uid 1000 --gid 1000 --create-home rails
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build --chown=rails:rails /app /app
USER rails
EXPOSE 10000
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
