const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const axios = require('axios');

// Konfigurasi pool koneksi database
const dbPool = mysql.createPool({
    host: '202.52.146.145',
    user: 'catidans_berkah',
    password: 'X1)y*etSm88-',
    database: 'catidans_berkah',
    waitForConnections: true,
    connectionLimit: 10, // Jumlah maksimum koneksi
    queueLimit: 0
});

// Fungsi untuk mendaftar pengguna baru
async function checkAndRegisterUser(sock, message) {
    const from = message.key.remoteJid; // Mendapatkan nomor WhatsApp pengirim
    const noWhatsApp = from.split('@')[0]; // Mengambil nomor tanpa domain

    // Mengecek apakah nomor sudah terdaftar
    dbPool.query('SELECT * FROM users WHERE no_whatsapp = ?', [noWhatsApp], async (err, results) => {
        if (err) {
            console.error('Error querying database:', err);
            return;
        }

        if (results.length === 0) {
            // Jika nomor belum terdaftar, otomatis mendaftar
            const username = noWhatsApp; // Username sama dengan nomor WhatsApp
            const password = noWhatsApp; // Password sama dengan nomor WhatsApp
            const hashedPassword = await bcrypt.hash(password, 10); // Menghash password
            const nama = 'User ' + Math.floor(Math.random() * 1000); // Nama bisa tetap acak
            const email = username + '@example.com';

            // Menyimpan pengguna baru ke database
            dbPool.query('INSERT INTO users (username, password, nama, no_whatsapp, email) VALUES (?, ?, ?, ?, ?)',
                [username, hashedPassword, nama, noWhatsApp, email],
                async (err) => {
                    if (err) {
                        console.error('Error inserting new user:', err);
                        return;
                    }

                    // Mengirim pesan selamat datang
                    const welcomeMessage = `Selamat datang! \nDikarenakan nomor kamu belum terdaftar di layanan kami, maka kami otomatis mendaftarkan kamu. \nUsername: ${username} \nPassword: ${password} \n\nGunakan itu untuk login di berkahprem.my.id\nFitur disana untuk:\n1. Garansi\n2. Renew\n\nUntuk order youtube, netflix dan lain lain silahkan balas pesan ini dengan kata .order`;
                    
                    await sock.sendMessage(from, { text: welcomeMessage });
                    console.log('User registered and welcome message sent.');
                }
            );
        } else {
            console.log('User already registered:', noWhatsApp);
        }
    });
}

// Ekspor fungsi
module.exports = { checkAndRegisterUser };