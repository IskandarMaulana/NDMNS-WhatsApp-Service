const express = require("express");
const router = express.Router();
const whatsAppService = require("./whatsapp");

// Health check endpoint
router.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()    
  });
});

// Endpoint untuk mendapatkan QR code
router.get("/api/whatsapp/qr", (req, res) => {
  const status = whatsAppService.getStatus();

  if (status.isReady) {
    // Jika sudah terautentikasi, kirim status connected
    res.status(200).json({
      isReady: true,
      status: "connected",
      qrCode: null,
    });
  } else if (status.qrCode) {
    // Jika QR code tersedia
    res.status(200).json({
      isReady: false,
      status: status.status,
      qrCode: status.qrCode,
    });
  } else {
    // Jika QR code belum tersedia
    res.status(200).json({
      isReady: false,
      status: status.status,
      qrCode: null,
    });
  }
});

router.get("/api/whatsapp/message", async (req, res) => {
  try {
    const status = whatsAppService.getStatus();

    if (!status.isReady) {
      return res.status(400).json({
        status: 400,
        message: "WhatsApp client is not ready",
      });
    }

    const { id } = req.body;
    const result = await whatsAppService.getMessageById(id);
    res.status(200).json({
      status: 200,
      message: "Success getting WhatsApp Message",
      data: result.data,
    });
  } catch (error) {
    console.error("Error getting Message:", error);
    res.status(500).json({
      status: 500,
      message: `Internal server error: ${error.message}`,
      data: null,
    });
  }
});

router.get("/api/whatsapp/groups", async (req, res) => {
  try {
    const status = whatsAppService.getStatus();

    if (!status.isReady) {
      return res.status(400).json({
        status: 400,
        message: "WhatsApp client is not ready",
      });
    }

    const result = await whatsAppService.getGroups();
    res.status(200).json({
      status: 200,
      message: "Success getting WhatsApp Groups",
      data: result.data,
    });
  } catch (error) {
    console.error("Error getting Groups:", error);
    res.status(500).json({
      status: 500,
      message: `Internal server error: ${error.message}`,
    });
  }
});

// Endpoint for sending various types of WhatsApp messages
router.post("/api/whatsapp/send", async (req, res) => {
  try {
    const { to, message, sendType, messageType, contents, options } = req.body;

    if (!to) {
      return res.status(400).json({
        status: 400,
        message: '"to" field is required',
      });
    }

    // Prepare options based on message type
    let messageContents = contents || {};

    // Set options based on messageType if provided
    switch (messageType) {
      case "text":
        // No additional options needed for text messages
        if (!message) {
          return res.status(400).json({
            status: 400,
            message: "Message body is required for text messages",
          });
        }
        break;

      case "media":
        // Validate required media parameters
        if (
          !messageContents.messageMedia ||
          !messageContents.messageMedia.isBase64 ||
          !messageContents.messageMedia.media ||
          !messageContents.messageMedia.mimeType ||
          !messageContents.messageMedia.filename
        ) {
          return res.status(400).json({
            status: 400,
            message: "Media content is required for media messages",
          });
        }
        break;

      case "location":
        // Validate required location parameters
        if (!messageContents.location || !messageContents.location.latitude || !messageContents.location.longitude) {
          return res.status(400).json({
            status: 400,
            message: "Location must include latitude and longitude",
          });
        }
        break;

      case "poll":
        // Validate required poll parameters
        if (
          !messageContents.poll ||
          !messageContents.poll.title ||
          !messageContents.poll.options ||
          !Array.isArray(messageContents.poll.options) ||
          messageContents.poll.options.length < 2
        ) {
          return res.status(400).json({
            status: 400,
            message: "Poll must include a title and at least 2 options",
          });
        }
        break;

      case "buttons":
        // Validate required buttons parameters
        if (!message) {
          return res.status(400).json({
            status: 400,
            message: "Message body is required for button messages",
          });
        }

        if (!messageContents.buttons || !Array.isArray(messageContents.buttons) || messageContents.buttons.length < 1) {
          return res.status(400).json({
            status: 400,
            message: "At least one button must be provided",
          });
        }
        break;

      case "list":
        // Validate required list parameters
        if (
          !messageContents.list ||
          !messageContents.list.sections ||
          !Array.isArray(messageContents.list.sections) ||
          messageContents.list.sections.length < 1
        ) {
          return res.status(400).json({
            status: 400,
            message: "List must include at least one section",
          });
        }
        break;

      case "contacts":
        // Validate required contacts parameters
        if (!messageContents.contacts) {
          return res.status(400).json({
            status: 400,
            message: "Contact information is required for contact messages",
          });
        }
        break;

      default:
        // Default to text message if no type specified
        if (!message) {
          return res.status(400).json({
            status: 400,
            message: "Message content is required",
          });
        }
    }

    // Send the message with appropriate options
    const result = await whatsAppService.sendMessage(to, message, sendType || "chat", messageContents, options);

    if (result.success) {
      res.status(200).json({
        status: 200,
        message: `${result.message}`,
        data: result.data,
      });
    } else {
      res.status(400).json({
        status: 400,
        message: `${result.message}`,
      });
    }
  } catch (error) {
    console.error("Error in send message endpoint:", error);
    res.status(500).json({
      status: 500,
      message: `Internal server error: ${error.message}`,
    });
  }
});

module.exports = router;
