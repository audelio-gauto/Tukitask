import { retiredWorkerResponse } from '@/lib/retiredWorker';

export async function GET(): Promise<Response> {
  return retiredWorkerResponse();
}
