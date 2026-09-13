from editor_common.cors import make_dynamic_cors_middleware

from . import runtime_config as rc

DynamicCORSMiddleware = make_dynamic_cors_middleware(get_origins=rc.get_cors_origins)
