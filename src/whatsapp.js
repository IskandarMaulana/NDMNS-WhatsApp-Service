const { Client, LocalAuth, MessageMedia, Location, List, Buttons } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const signalRClient = require("./signalr-client");
const moment = require("moment-timezone");

class WhatsAppService {
  constructor() {
    this.client = null;
    this.qrCode = null;
    this.number = null;
    this.isReady = false;
    this.status = "initializing";
    this.initAttempts = 0;
    this.maxInitAttempts = 5;
    this.initTimeout = null;
    this.initialize();
  }

  // Method untuk memformat nomor telepon
  formatTo(to, sendType) {
    // Hapus karakter selain angka
    let formatted = to.replace(/[^\d]/g, "");

    // Pastikan nomor berawalan dengan format negara tanpa '+'
    if (formatted.startsWith("0")) {
      formatted = "62" + formatted.substring(1);
    }

    if (sendType == "chat" && !formatted.endsWith("@c.us")) {
      formatted += "@c.us";
    }

    if (sendType == "group" && !formatted.endsWith("@g.us")) {
      formatted += "@g.us";
    }

    return formatted;
  }

  // Method untuk mendapatkan status saat ini
  getStatus() {
    return {
      isReady: this.isReady,
      status: this.status,
      qrCode: this.qrCode,
    };
  }

  async destroyClient() {
    try {
      if (this.client) {
        console.log("Destroying existing WhatsApp client...");
        await this.client.destroy();
        this.client = null;
      }
    } catch (error) {
      console.error("Error destroying client:", error);
    }
  }

  async initialize() {
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }

    this.initAttempts++;
    console.log(`Initializing WhatsApp client (attempt ${this.initAttempts})`);

    try {
      // await this.destroyClient();

      this.isReady = false;
      this.status = "initializing";
      this.qrCode = null;

      if (signalRClient.isConnected()) {
        signalRClient.sendStatus(this.number, "initializing");
      }

      this.client = new Client({
        authStrategy: new LocalAuth({ clientId: "whatsapp-service", dataPath: "./local_auth" }),
        restartOnAuthFail: true,
        puppeteer: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
            "--disable-default-apps",
            "--mute-audio",
            "--hide-scrollbars",
            "--ignore-certificate-errors",
            "--ignore-certificate-errors-spki-list",
            "--disable-features=TranslateUI",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-breakpad",
            "--disable-component-update",
            "--disable-domain-reliability",
            "--disable-sync",
            "--window-size=1280,800",
          ],
          ignoreHTTPSErrors: true,
          defaultViewport: { width: 1280, height: 800 },
          timeout: 120000,
          protocolTimeout: 60000,
        },
      });

      this.client.on("qr", (qr) => {
        console.log("QR code received");

        this.qrCode = qr;
        this.status = "qr_ready";

        // Menampilkan QR code di terminal untuk debugging
        // qrcode.generate(qr, { small: true });

        if (signalRClient.isConnected()) {
          signalRClient.sendQrCode(qr);
        }
      });

      this.client.on("ready", () => {
        console.log("WhatsApp client is ready!");
        this.isReady = true;
        this.status = "connected";
        this.initAttempts = 0;

        if (signalRClient.isConnected()) {
          // signalRClient.sendStatus("connected");
          this.number = this.client.info.wid.user;
          signalRClient.sendStatus(this.number, "connected");
        }
      });

      this.client.on("authenticated", () => {
        console.log("WhatsApp client authenticated");
        this.status = "authenticated";

        if (signalRClient.isConnected()) {
          signalRClient.sendStatus(this.number, "authenticated");
        }
      });

      this.client.on("auth_failure", (msg) => {
        console.error("Authentication failure:", msg);
        this.status = "auth_failed";

        if (signalRClient.isConnected()) {
          signalRClient.sendStatus(this.number, "auth_failed");
        }

        this.scheduleReinitialization();
      });

      this.client.on("disconnected", async (reason) => {
        console.log("WhatsApp client disconnected:", reason);
        this.isReady = false;
        this.status = "disconnected";

        if (signalRClient.isConnected()) {
          signalRClient.sendStatus(this.number, "disconnected");
        }

        // this.scheduleReinitialization();
      });

      this.client.on("error", (error) => {
        console.error("WhatsApp client error:", error);
        this.status = "error";

        // Update status ke ASP.NET Core
        if (signalRClient.isConnected()) {
          signalRClient.sendStatus(this.number, "error");
        }

        // Check if error is related to navigation or page crash
        const errorMessage = error.message || "";
        if (
          errorMessage.includes("navigation") ||
          errorMessage.includes("Execution context was destroyed") ||
          errorMessage.includes("Target closed") ||
          errorMessage.includes("Protocol error")
        ) {
          this.scheduleReinitialization();
        }
      });

      this.client.on("message", async (message) => {
        try {
          const chat = await message.getChat();
          const contact = await message.getContact();

          let repliedToMessageId = null;

          if (message.hasQuotedMsg) {
            const quotedMsg = await message.getQuotedMessage();
            repliedToMessageId = quotedMsg.id.id;
          }

          if (String(message.timestamp).length === 10) {
            message.timestamp = message.timestamp * 1000;
          }

          // const date = new Date(message.timestamp);

          // const formatter = new Intl.DateTimeFormat("en-CA", {
          //   timeZone: "Asia/Jakarta",
          //   year: "numeric",
          //   month: "2-digit",
          //   day: "2-digit",
          //   hour: "2-digit",
          //   minute: "2-digit",
          //   second: "2-digit",
          //   hour12: false,
          // });

          // const parts = formatter.formatToParts(date);
          // const formatPart = (type) => parts.find((p) => p.type === type)?.value.padStart(2, "0");

          // const localIso = `${formatPart("year")}-${formatPart("month")}-${formatPart("day")}T${formatPart("hour")}:${formatPart(
          //   "minute"
          // )}:${formatPart("second")}`;

          const localIso = moment(message.timestamp).tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");

          const messageData = {
            id: message.id.id,
            body: message.body,
            from: message.from,
            fromName: contact ? contact.name || contact.pushname || "" : "",
            to: message.to,
            isGroup: chat.isGroup,
            groupName: chat.isGroup ? chat.name : null,
            timestamp: localIso,
            hasMedia: message.hasMedia,
            isReply: message.hasQuotedMsg,
            repliedToMessageId: repliedToMessageId,
          };

          if (signalRClient.isConnected()) {
            signalRClient.sendReceivedMessage(messageData);
          }
        } catch (error) {
          console.error("Error processing received message:", error);
        }
      });

      this.client.on("message_create", async (msg) => {
        // Hanya proses jika pesan dikirim oleh orang lain (bukan diri sendiri)
        if (msg.fromMe) return;

        // Periksa apakah pesan mengandung respons tombol
        if (msg.type === "buttons_response") {
          try {
            console.log("Button response received:", msg.body);

            // Mendapatkan informasi tombol yang dipilih
            const selectedButton = msg.selectedButtonId;

            // Mendapatkan chat dan kontak terkait
            const chat = await msg.getChat();
            const contact = await msg.getContact();

            // Cek apakah ini adalah respons terhadap pesan yang kita kirim sebelumnya
            let repliedToMessageId = null;

            if (msg.hasQuotedMsg) {
              const quotedMsg = await msg.getQuotedMessage();
              repliedToMessageId = quotedMsg.id.id;
            }

            // Membuat objek data respons tombol untuk dikirim ke SignalR
            const buttonResponseData = {
              id: msg.id.id,
              body: msg.body,
              selectedButton: selectedButton,
              from: msg.from,
              fromName: contact ? contact.name || contact.pushname || "" : "",
              timestamp: msg.timestamp,
              isGroup: chat.isGroup,
              groupName: chat.isGroup ? chat.name : null,
              isReply: msg.hasQuotedMsg,
              repliedToMessageId: repliedToMessageId,
              messageType: "button_response",
            };

            // Kirim data respons tombol ke ASP.NET Core melalui SignalR
            if (signalRClient.isConnected()) {
              signalRClient.sendButtonResponse(buttonResponseData);
            }
          } catch (error) {
            console.error("Error processing button response:", error);
          }
        }
      });

      try {
        await this.client.initialize();
      } catch (error) {
        console.error("Error during client initialization:", error);
        this.status = "init_failed";

        // Update status ke ASP.NET Core
        if (signalRClient.isConnected()) {
          signalRClient.sendStatus(this.number, "init_failed");
        }

        // Try to reinitialize
        this.scheduleReinitialization();
      }
    } catch (error) {
      console.error("Error setting up WhatsApp client:", error);
      this.status = "setup_failed";

      // Update status ke ASP.NET Core
      if (signalRClient.isConnected()) {
        signalRClient.sendStatus(this.number, "setup_failed");
      }

      // Try to reinitialize
      this.scheduleReinitialization();
    }
  }

  scheduleReinitialization() {
    if (this.initAttempts >= this.maxInitAttempts) {
      console.error(`Maximum initialization attempts (${this.maxInitAttempts}) reached. Please restart the service manually.`);
      this.status = "max_attempts_reached";

      // Update status ke ASP.NET Core
      if (signalRClient.isConnected()) {
        signalRClient.sendStatus(this.number, "max_attempts_reached");
      }
      return;
    }

    const delayMs = Math.min(5000 * Math.pow(2, this.initAttempts - 1), 60000);
    console.log(`Scheduling reinitialization in ${delayMs / 1000} seconds (attempt ${this.initAttempts + 1}/${this.maxInitAttempts})...`);

    this.initTimeout = setTimeout(() => {
      this.initialize();
    }, delayMs);
  }

  async getMessageById(id) {
    try {
      if (!this.isReady) {
        throw new Error("WhatsApp client is not ready");
      }

      console.log(id);
      const message = await this.client.getMessageById(id);
      console.log(message);
      return {
        success: true,
        data: message,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get groups: ${error.message}`,
      };
    }
  }

  async getGroups() {
    try {
      if (!this.isReady) {
        throw new Error("WhatsApp client is not ready");
      }

      const chats = await this.client.getChats();

      const groups = chats
        .filter((chat) => chat.isGroup)
        .map((group) => ({
          id: group.id._serialized,
          name: group.name,
        }));

      return {
        success: true,
        data: groups,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get groups: ${error.message}`,
      };
    }
  }

  async sendMessage(to, message, sendType, contents = {}, options) {
    try {
      if (!this.isReady) {
        throw new Error("WhatsApp client is not ready");
      }

      const chatId = this.formatTo(to, sendType);

      let response;
      let messageContent = message;
      let messageOptions = {};

      // 1. Media Message (Image, Document, Video, Audio)
      if (contents && contents.messageMedia && contents.messageMedia.media) {
        // If media object is provided directly
        if (contents.messageMedia instanceof MessageMedia) {
          messageContent = contents.messageMedia.media;
        }
        // If base64 data is provided
        else if (contents.messageMedia.isBase64) {
          messageContent = new MessageMedia(
            contents.messageMedia.mimeType || "image/jpeg",
            contents.messageMedia.media.replace(/^data:.*?;base64,/, ""),
            contents.messageMedia.filename || "file.jpg"
          );
          //   messageOptions.sendMediaAsHd = true;
        }
        // Add caption if provided
        if (message && typeof message === "string") {
          messageOptions.caption = message;
        }
      }

      // 2. Location Message
      else if (contents && contents.location) {
        // Create Location object
        const { latitude, longitude, description } = contents.location;
        const location = new Location(latitude, longitude, description);
        messageContent = location;
      }

      // 3. Poll Message
      else if (contents && contents.poll) {
        const { title, contents: pollOptions, allowMultipleAnswers = false } = contents.poll;
        messageContent = {
          json: {
            type: "poll_creation",
            poll: {
              title: title,
              options: pollOptions.map((option) => ({ name: option })),
              multipleAnswers: allowMultipleAnswers,
            },
          },
          type: "poll_creation",
        };
      }

      // 4. Contact Message
      else if (contents && contents.contacts) {
        // If it's a single contact or array of contacts
        messageContent = contents.contacts;
      }

      // 5. List Message
      else if (contents && contents.list) {
        const { body, buttonText, sections, title, footer } = contents.list;
        messageContent = {
          body: body || message,
          buttonText: buttonText || "Lihat Opsi",
          sections: sections,
          title: title || "",
          footer: footer || "",
        };
        messageOptions.type = "list";
      }

      // 6. Buttons Message
      else if (contents && contents.buttons) {
        messageContent = {
          body: message,
          buttons: contents.buttons,
          footer: contents.footer || "Silakan pilih salah satu opsi",
        };
        messageOptions.type = "buttons";
      }

      if (options && options.mentions) {
        messageOptions.mentions = options.mentions;
      }

      console.log(options);
      if (options && options.quotedMessageId) {
        const quotedMessage = await this.client.getMessageById(options.quotedMessageId);
        console.log(quotedMessage);

        if (quotedMessage) {
          let chat = quotedMessage.getChat();
          console.log(chat);

          response = await quotedMessage.reply(messageContent, chat.id._serialized, messageOptions);
        } else {
          throw new Error("Message not found or not in cache");
        }
      } else {
        console.log("sending without reply");
        response = await this.client.sendMessage(chatId, messageContent, messageOptions);
      }

      console.log(response);

      const chat = await response.getChat();
      const contact = await response.getContact();

      if (String(response.timestamp).length === 10) {
        response.timestamp = response.timestamp * 1000;
      }

      const localIso = moment(message.timestamp).tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss");

      const data = {
        id: response.id.id,
        body: response.body,
        from: response.from,
        fromName: contact ? contact.name || contact.pushname || "" : "",
        to: response.to,
        isGroup: chat.isGroup,
        groupName: chat.isGroup ? chat.name : null,
        timestamp: localIso,
        hasMedia: response.hasMedia,
        isReply: response.hasQuotedMsg,
        repliedToMessageId: response.repliedToMessageId,
      };

      return {
        success: true,
        message: "Message sent successfully",
        data: data,
      };
    } catch (error) {
      console.error("Error sending message:", error);
      return {
        success: false,
        message: `Failed to send message: ${error.message}`,
      };
    }
  }

  async sendReply(messageId, messageContents, messageOptions) {
    try {
      const quotedMessage = await this.client.getMessageById(messageId);

      if (quotedMessage) {
        let chat = quotedMessage.getChat();
        const response = await quotedMessage.reply(messageContents, chat.id._serialized, messageOptions);
        return {
          success: true,
          data: response,
        };
      } else {
        throw new Error("Message not found or not in cache");
      }
    } catch (error) {
      console.error("Error sending reply:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

// Singleton instance
const whatsAppService = new WhatsAppService();

module.exports = whatsAppService;
