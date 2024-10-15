const { DisconnectReason, makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2');
const moment = require('moment-timezone');
const qrcodeTerminal = require('qrcode-terminal');
const handleIncomingMessages = require('./scripts/respon');
const { checkAndRegisterUser } = require('./scripts/daftar');
const handleCommands = require('./scripts/perintah'); // Mengimpor perintah.js

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());

// Fungsi untuk membuat pool koneksi MySQL
const dbPool = mysql.createPool({
    host: '202.52.146.145',
    user: 'catidans_berkah',
    password: 'X1)y*etSm88-',
    database: 'catidans_berkah',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Fungsi untuk menangani error koneksi MySQL dan melakukan rekoneksi
function handleDisconnect() {
    dbPool.getConnection((err, connection) => {
        if (err) {
            console.error('Error saat menghubungkan ke database:', err);
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                console.log('Koneksi database terputus. Mencoba untuk reconnect...');
                setTimeout(handleDisconnect, 2000); // Coba reconnect setelah 2 detik
            } else {
                throw err; // Jika error lain, lempar error
            }
        } else {
            console.log('Terhubung kembali ke database.');
            connection.release(); // Pastikan koneksi dilepaskan kembali ke pool
        }
    });

    dbPool.on('error', (err) => {
        console.error('Database pool error:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.log('Koneksi database terputus. Mencoba untuk reconnect...');
            handleDisconnect();
        } else {
            throw err; // Lempar error jika bukan error yang dapat ditangani
        }
    });
}

handleDisconnect();

// Store the socket instance
let sockInstance;

// Function to delete all files in the auth_info_baileys folder
function deleteAuthFiles(callback) {
    const authFolder = 'auth_info_baileys';

    fs.readdir(authFolder, (err, files) => {
        if (err) {
            console.error('Failed to read auth_info_baileys directory:', err);
            callback(err);
            return;
        }

        if (files.length === 0) {
            console.log('No files to delete.');
            callback();
            return;
        }

        let filesDeleted = 0;
        files.forEach(file => {
            const filePath = path.join(authFolder, file);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Failed to delete file:', filePath, err);
                } else {
                    console.log('Deleted file:', filePath);
                    filesDeleted += 1;
                }
                if (filesDeleted === files.length) {
                    callback();
                }
            });
        });
    });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state
    });

    sockInstance = sock; // Save the socket instance for later use

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to', lastDisconnect.error, ', reconnecting:', shouldReconnect);

            if (!shouldReconnect) {
                deleteAuthFiles((err) => {
                    if (err) {
                        console.error('Failed to delete auth files:', err);
                    } else {
                        console.log('Auth files deleted, showing new QR code.');
                        connectToWhatsApp(); // Reinitialize connection to display new QR code
                    }
                });
            } else {
                setTimeout(() => connectToWhatsApp(), 5000); // Wait 5 seconds before reconnecting
            }

            io.emit('connection.update', { status: 'disconnected' });
        } else if (connection === 'open') {
            console.log('Opened connection');
            io.emit('connection.update', { status: 'connected' });
        }

        if (qr) {
            qrcodeTerminal.generate(qr, { small: true });
            try {
                const qrBase64 = await QRCode.toDataURL(qr);
                console.log('QR Code base64:', qrBase64);

                fs.writeFile('qr_code.json', JSON.stringify({ qr: qrBase64 }), (err) => {
                    if (err) {
                        console.error('Failed to save QR code to file:', err);
                    } else {
                        console.log('QR code saved to qr_code.json');
                        io.emit('connection.update', { qr: qrBase64 });
                    }
                });
            } catch (err) {
                console.error('Failed to generate QR code:', err);
            }
        }
    });

    fs.writeFile('qr_code.json', JSON.stringify({ qr: "" }), (err) => {
        if (err) {
            console.error('Failed to clear qr_code.json:', err);
        } else {
            console.log('qr_code.json cleared');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Menangani pesan masuk
    sock.ev.on('messages.upsert', async (msg) => {
        const message = msg.messages[0];

        // Pastikan pesan yang diterima bukan dari pengirim bot itu sendiri
        if (!message.key.fromMe && message.message) {
            console.log('Pesan diterima:', message); // Log pesan yang diterima
            await checkAndRegisterUser(sock, message);
            await handleCommands(sock, dbPool); // Memanggil fungsi untuk menangani perintah
        } else {
            console.log('Pesan dari bot atau tidak valid, diabaikan.');
        }
    });

    handleIncomingMessages(sock); // Memanggil fungsi untuk menangani pesan masuk lebih lanjut

    return sock;
}

// Function to check and send scheduled messages
function checkAndSendMessages() {
    setInterval(() => {
        const now = moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
        console.log(`Checking messages at: ${now} (WIB)`);

        dbPool.query('SELECT * FROM scheduled_messages WHERE send_time <= ?', [now], (err, results) => {
            if (err) {
                console.error('Error fetching scheduled messages:', err);
                return;
            }

            if (results.length === 0) {
                console.log('No messages to send.');
            } else {
                results.forEach(async (message) => {
                    try {
                        console.log(`Sending message to ${message.phone_number}`);

                        if (sockInstance) { // Check if socket instance exists
                            await sockInstance.sendMessage(message.phone_number + '@c.us', { text: message.message });
                            console.log(`Message sent to ${message.phone_number}`);

                            // Delete the message after sending
                            dbPool.query('DELETE FROM scheduled_messages WHERE id = ?', [message.id], (err) => {
                                if (err) {
                                    console.error('Error deleting message:', err);
                                } else {
                                    console.log('Message deleted from schedule.');
                                }
                            });
                        } else {
                            console.error('WhatsApp not connected. Cannot send message.');
                        }
                    } catch (err) {
                        console.error('Failed to send message:', err);
                    }
                });
            }
        });
    }, 60000); // Check every minute
}

// API endpoint to disconnect
app.post('/disconnect', (req, res) => {
    deleteAuthFiles((err) => {
        if (err) {
            res.json({ success: false });
        } else {
            res.json({ success: true });
        }
    });
});

server.listen(8000, () => {
    console.log('Server running on port 8000');
    connectToWhatsApp().catch(console.error);
    checkAndSendMessages(); // Start checking and sending messages
});
