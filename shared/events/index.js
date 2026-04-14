const Redis = require('ioredis');

class EventBus {
  constructor(options = {}) {
    this.redis = new Redis({
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || process.env.REDIS_PORT || 6379,
    });
  }

  async publish(stream, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    return await this.redis.xadd(stream, '*', 'data', payload);
  }

  async subscribe(stream, group, consumer, callback) {
    try {
      await this.redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (err) {
      if (!err.message.includes('BUSYGROUP')) throw err;
    }

    const poll = async () => {
      while (true) {
        const results = await this.redis.xreadgroup(
          'GROUP', group, consumer,
          'COUNT', 1, 'BLOCK', 5000,
          'STREAMS', stream, '>'
        );

        if (results) {
          const [streamName, messages] = results[0];
          for (const [id, [_, data]] of messages) {
            try {
              const parsedData = JSON.parse(data);
              await callback(parsedData, id);
              await this.redis.xack(stream, group, id);
            } catch (err) {
              console.error(`Error processing event ${id} from ${streamName}:`, err);
            }
          }
        }
      }
    };

    poll().catch(err => console.error(`Error in event subscriber for ${stream}:`, err));
  }
}

module.exports = new EventBus();
