// src/signalr-client.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const signalR = require("@microsoft/signalr");
require("dotenv").config();

class SignalRClient {
  constructor() {
    this.connection = null;
    this.connected = false;
    this.hubUrl = process.env.SIGNALR_HUB_URL || "https://localhost:44365/hubs/whatsapp";
    this.initialize();
  }

  async initialize() {
    try {
      console.log(this.hubUrl);
      // Buat koneksi ke SignalR hub di ASP.NET Core
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(this.hubUrl, {
          withCredentials: false,
        })
        .build();

      // Event handlers
      this.connection.onreconnecting(() => {
        console.log("SignalR reconnecting...");
        this.connected = false;
      });

      this.connection.onreconnected(() => {
        console.log("SignalR reconnected!");
        this.connected = true;
      });

      this.connection.onclose((error) => {
        console.log(`SignalR connection closed: ${error}`);
        this.connected = false;
        // Coba koneksi ulang setelah 5 detik
        setTimeout(() => this.initialize(), 5000);
      });

      // Start koneksi
      await this.connection.start();
      console.log("SignalR connected to hub:", this.hubUrl);
      this.connected = true;
    } catch (error) {
      console.error("Error connecting to SignalR hub:", error);
      this.connected = false;
      // Coba koneksi ulang setelah 5 detik
      setTimeout(() => this.initialize(), 5000);
    }
  }

  // Method untuk memeriksa koneksi
  isConnected() {
    return this.connected;
  }

  // Method untuk mengirim QR code ke SignalR hub
  async sendQrCode(qrCode) {
    if (this.connected) {
      try {
        await this.connection.invoke("UpdateQrCode", qrCode);
        console.log("QR code sent to SignalR hub");
      } catch (error) {
        console.error("Error sending QR code to SignalR hub:", error);
      }
    } else {
      console.warn("SignalR not connected, cannot send QR code");
    }
  }

  // Method untuk mengirim status ke SignalR hub
  async sendStatus(number, status) {
    if (this.connected) {
      try {
        await this.connection.invoke("UpdateWhatsAppStatus", number, status);
        console.log("Status sent to SignalR hub:", status);
      } catch (error) {
        console.error("Error sending status to SignalR hub:", error);
      }
    } else {
      console.warn("SignalR not connected, cannot send status");
    }
  }

  async sendReceivedMessage(messageData) {
    if (this.connected) {
      try {
        console.log(messageData);
        await this.connection.invoke("ReceiveWhatsAppMessage", messageData);
        console.log("Received message sent to SignalR hub:", messageData.id);
      } catch (error) {
        console.error("Error sending received message to SignalR hub:", error);
      }
    } else {
      console.warn("SignalR not connected, cannot send received message");
    }
  }

  async sendButtonResponse(buttonData) {
    if (this.connected) {
      try {
        await this.connection.invoke("ReceiveButtonResponse", buttonData);
        console.log("Button response sent to SignalR hub:", buttonData.id);
      } catch (error) {
        console.error("Error sending button response to SignalR hub:", error);
      }
    } else {
      console.warn("SignalR not connected, cannot send button response");
    }
  }
}

// Singleton instance
const signalRClient = new SignalRClient();

module.exports = signalRClient;
