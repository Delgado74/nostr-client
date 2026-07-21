import WebSocket from 'ws';

export default class Relay {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.subscriptions = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log(`Conectado a ${this.url}`);
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('error', (err) => {
        console.error(`Error en ${this.url}:`, err.message);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log(`Desconectado de ${this.url}`);
      });
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
        const [eventId, status, message] = rest;
        if (status) {
          console.log(`Evento ${eventId} aceptado`);
        } else {
          console.log(`Evento ${eventId} rechazado: ${message}`);
        }
        break;
      }
      case 'NOTICE': {
        console.log(`Aviso: ${rest[0]}`);
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
    this.ws.send(JSON.stringify(['EVENT', event]));
  }

  close() {
    this.subscriptions.clear();
    this.ws.close();
  }
}
