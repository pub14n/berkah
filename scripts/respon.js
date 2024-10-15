const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// Konfigurasi koneksi MySQL
let db;

function handleDisconnect() {
    db = mysql.createConnection({
        host: '202.52.146.145',
        user: 'catidans_berkah',
        password: 'X1)y*etSm88-',
        database: 'catidans_berkah'
    });

    db.connect((err) => {
        if (err) {
            console.error('Error connecting to the database:', err);
            setTimeout(handleDisconnect, 5000); // Coba rekoneksi setiap 5 detik jika gagal
        } else {
            console.log('Connected to the database.');
        }
    });

    db.on('error', (err) => {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed. Reconnecting...');
            handleDisconnect();
        } else {
            console.error('Database error:', err);
            throw err;
        }
    });
}

handleDisconnect();

// Ping database setiap 1 menit untuk menjaga koneksi tetap aktif
setInterval(() => {
    if (db && db.state !== 'disconnected') {
        db.ping((err) => {
            if (err) {
                console.error('Error pinging the database:', err);
                handleDisconnect();
            } else {
                console.log('Database ping successful.');
            }
        });
    }
}, 60000); // Ping setiap 60 detik

const messageTimers = {};

// Array pesan alternatif
const alternativeMessages = [
    'kak admin yang berkaitan sedang diluar\n\ntapi jangan khawatir aku siap bantu kakak, kk kirim pesan ke aku dengan format dibawah ini ya biar aku lebih mudah memahaminya\n\n*error youtube*\nkirim pesan itu ke aku jika akun youtube kk mengalami masalah, jika akun lain yang bermasalah ubah aja ujungnya, misal netflix berarti error netflix\n\nJika kk ingin order kk bisa order langsung di https://berkahprem.my.id , proses instan dan akun dikirim otomatis\n\nJika kk ada keperluan lain, mohon tunggu beberapa saat lagi ya',
    'Hallo kak, aku siap bantu kk walaupun aku hanya asisten disini :)\n\nKk boleh kirim pesan ke aku dengan kata *#menu* nanti aku kasih daftar layanan yg bisa aku bantu\n\nUntuk keperluan lain mohon tunggu ya kak, admin sebentar lagi kembali',
    'Hallo kak, permintaan kamu masih dalam proses oleh admin terkait\n\nUntuk mengetahui fitur lainnya silahkan kirim chat *#menu*\n\nBisa garansi, renew, order, dan lainnya',
    'Hallo kak, permintaan kamu masih dalam proses oleh admin terkait\n\nUntuk mengetahui fitur lainnya silahkan kirim chat *#menu*\n\nBisa garansi, renew, order, dan lainnya'
];

module.exports = (sock) => {
    sock.ev.on('messages.upsert', async (message) => {
        const { messages, type } = message;
        if (type === 'notify') {
            const msg = messages[0];
            if (!msg.key.fromMe && msg.message && msg.message.conversation) {
                const text = msg.message.conversation;
                const senderId = msg.key.remoteJid;

                console.log(`Pesan diterima: ${text}`);

                // Cek apakah pengirim adalah nomor yang tidak boleh dibalas
                if (msg.key.remoteJid === '6281271170052@s.whatsapp.net') {
                    console.log('Pesan dari 6281271170052 tidak akan dibalas.');
                    return; 
                }

                // Cek apakah pengirim ada di daftar nomor yang dikecualikan
                try {
                    const [excluded] = await db.promise().query('SELECT * FROM excluded_numbers WHERE phone_number = ?', [msg.key.remoteJid]);
                    if (excluded.length > 0) {
                        console.log(`Pesan dari ${msg.key.remoteJid} tidak akan dibalas karena terdaftar di arsip.`);
                        return; 
                    }
                } catch (err) {
                    console.error('Error checking excluded numbers:', err);
                    return;
                }

                // Tandai pesan sebagai sudah dibaca
                const key = {
                    remoteJid: msg.key.remoteJid,
                    id: msg.key.id,
                    participant: msg.key.participant || undefined
                };
                await sock.readMessages([key]);

                // Reset timer jika ada pesan dari nomor yang sama
                if (messageTimers[senderId]) {
                    clearTimeout(messageTimers[senderId]);
                }

                // Setel timer untuk mengirim pesan alternatif setelah 5 menit
                messageTimers[senderId] = setTimeout(async () => {
                    const randomIndex = Math.floor(Math.random() * alternativeMessages.length);
                    const randomMessage = alternativeMessages[randomIndex];
                    await sock.sendMessage(senderId, { text: randomMessage });
                    delete messageTimers[senderId]; // Hapus timer setelah pesan dikirim
                }, 300000); // 5 menit dalam milidetik

                try {
                    // Cek template di database
                    const [templates] = await db.promise().query('SELECT * FROM response_templates WHERE is_enabled = true');
                    if (templates.length > 0) {
                        let exactMatchTemplate = null;
                        let matchedTemplates = [];

                        const textLower = text.toLowerCase();

                        for (const template of templates) {
                            const keywords = template.keyword.split('|').map(k => k.trim().toLowerCase());

                            // Cek apakah ada keyword yang sama persis
                            if (keywords.includes(textLower)) {
                                exactMatchTemplate = template;
                                break; 
                            }

                            const matchedKeywords = keywords.filter(keyword => textLower.includes(keyword));
                            const matchedCount = matchedKeywords.length;

                            if (matchedCount > 0) {
                                matchedTemplates.push({
                                    template: template.template,
                                    query: template.query,
                                    matchedKeywords,
                                    keywords
                                });
                            }
                        }

                        if (exactMatchTemplate) {
                            // Jika ada template yang sama persis dengan pesan
                            const [responseResults] = await db.promise().query(exactMatchTemplate.query);
                            if (responseResults.length > 0) {
                                const responseText = responseResults[0].response;
                                await sock.sendMessage(msg.key.remoteJid, { text: responseText });
                            }
                        } else if (matchedTemplates.length > 0) {
                            // Jika tidak ada yang persis, gunakan template yang cocok sebagian
                            matchedTemplates.sort((a, b) => {
                                const aCount = a.matchedKeywords.length;
                                const bCount = b.matchedKeywords.length;
                                if (aCount !== bCount) return bCount - aCount; // Urutkan berdasarkan jumlah keyword
                                
                                const aFirstPos = Math.min(...a.keywords.map(keyword => text.indexOf(keyword)));
                                const bFirstPos = Math.min(...b.keywords.map(keyword => text.indexOf(keyword)));

                                return aFirstPos - bFirstPos;
                            });
                            
                            const matchedTemplate = matchedTemplates[0];
                            if (matchedTemplate) {
                                const [responseResults] = await db.promise().query(matchedTemplate.query);
                                if (responseResults.length > 0) {
                                    const responseText = responseResults[0].response;
                                    await sock.sendMessage(msg.key.remoteJid, { text: responseText });
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error handling message:', err);
                    await sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat memproses pesan.' });
                }
            }
        }
    });
};
