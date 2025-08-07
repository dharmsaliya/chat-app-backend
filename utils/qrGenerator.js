const QRCode = require('qrcode');

// Generate QR code data string
const generateQRData = (username) => {
  return `chatapp://user/${username}`;
};

// Generate QR code as base64 image (optional - for future use)
const generateQRCodeImage = async (username) => {
  try {
    const qrData = generateQRData(username);
    const qrCodeBase64 = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCodeBase64;
  } catch (error) {
    console.error('Error generating QR code image:', error);
    throw new Error('Failed to generate QR code image');
  }
};

// Parse QR code data to extract username
const parseQRData = (qrData) => {
  try {
    const match = qrData.match(/^chatapp:\/\/user\/(.+)$/);
    if (match) {
      return match[1]; // username
    }
    return null;
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateQRData,
  generateQRCodeImage,
  parseQRData
};