import multiprocessing

# Single worker: generation jobs + SSE live in process memory.
# workers > 1 without sticky sessions causes POST /generate/jobs on worker A
# and EventSource on worker B to return 404 (job not found in other worker memory).
workers = 1

worker_class = "uvicorn.workers.UvicornWorker"

bind = "127.0.0.1:4242"

timeout = 300

max_requests = 1000
max_requests_jitter = 50

accesslog = "-"
errorlog = "-"
loglevel = "info"

proc_name = "dialogue-generator-api"

chdir = "/opt/DialogueGeneratorV2"

preload_app = True