// Shared direct-to-Turso entry point; retained so existing route imports remain valid.
import runtime from '../vercel-api.js';
export default runtime.createVercelHandler();
