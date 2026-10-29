# One process on Render Starter; no forked workers or background queue runtime.
workers 0
threads_count = Integer(ENV.fetch("RAILS_MAX_THREADS", 3))
threads threads_count, threads_count
port ENV.fetch("PORT", 3031)
plugin :tmp_restart
pidfile ENV["PIDFILE"] if ENV["PIDFILE"]
