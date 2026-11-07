import { DurableObject } from 'cloudflare:workers';
import worker, { RoundJob as RoundJobHandler, CheckJob as CheckJobHandler } from './trainer.js';

export class RoundJob extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.handler = new RoundJobHandler(ctx, env);
  }

  fetch(request) {
    return this.handler.fetch(request);
  }

  alarm() {
    return this.handler.alarm();
  }
}

export default worker;

export class CheckJob extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.handler = new CheckJobHandler(ctx, env);
  }

  fetch(request) { return this.handler.fetch(request); }
  alarm() { return this.handler.alarm(); }
}
