const nodemailer = require('nodemailer');

function createMailer({ host, port, from }) {
  const transport = nodemailer.createTransport({ host, port, secure: false });

  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from, to, subject, text });
      console.log(`[mailer] sent "${subject}" to ${to}`);
    },
  };
}

module.exports = { createMailer };
