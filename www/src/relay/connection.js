export default class Relay {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.subscriptions = new Map();
    this.onOk = null;
    this.onNotice = null;
  }

  connect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws.close();
        reject(new Error('Timeout'));
      }, timeoutMs);

      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        clearTimeout(timer);
        console.log(`Conectado a ${this.url}`);
        resolve();
      };

      this.ws.onmessage = (e) => {
        this.handleMessage(JSON.parse(e.data));
      };

      this.ws.onerror = (err) => {
        clearTimeout(timer);
        console.error(`Error en ${this.url}`);
        reject(err);
      };

      this.ws.onclose = () => {
        clearTimeout(timer);
        console.log(`Desconectado de ${this.url}`);
      };
    });
  }

  handleMessage(message) {
    const [type, ...rest] = message;

    switch (type) {
      case 'EVENT': {
        const [subId, event] = rest;
        if (this.subscriptions.has(subId)) {
          this.subscriptions.get(subId)(event);
        }
        break;
      }
      case 'EOSE': {
        const [subIdEose] = rest;
        console.log(`Fin de suscripción: ${subIdEose}`);
        break;
      }
      case 'OK': {
        const [eventId, status, msg] = rest;
        if (status) {
          console.log(`Evento ${eventId} aceptado en ${this.url}`);
        } else {
          console.log(`Evento ${eventId} rechazado en ${this.url}: ${msg}`);
        }
        if (this.onOk) this.onOk(eventId, status, msg, this.url);
        break;
      }
      case 'NOTICE': {
        const notice = rest[0];
        console.log(`Aviso de ${this.url}: ${notice}`);
        if (this.onNotice) this.onNotice(notice, this.url);
        break;
      }
    }
  }

  subscribe(subId, filters, callback) {
    this.subscriptions.set(subId, callback);
    this.ws.send(JSON.stringify(['REQ', subId, ...filters]));
  }

  unsubscribe(subId) {
    this.subscriptions.delete(subId);
    this.ws.send(JSON.stringify(['CLOSE', subId]));
  }

  publish(event) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['EVENT', event]));
    } else {
      console.warn(`No se pudo enviar a ${this.url}: WebSocket no conectado`);
    }
  }

  close() {
    this.subscriptions.clear();
    this.ws.close();
  }
}
