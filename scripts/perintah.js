const mysql = require('mysql2');

// Buat koneksi ke database
const db = mysql.createConnection({
    host: '202.52.146.145',
    user: 'catidans_berkah',
    password: 'X1)y*etSm88-',
    database: 'catidans_berkah'
});

// Variabel untuk menangani eksekusi ganda
let isProcessingGaransiId = false;
let lastPendingMessageSent = false;
let lastAddMessageSent = false; // Variabel untuk melacak pengiriman pesan .tambah
let lastRemoveMessageSent = false; // Variabel untuk melacak pengiriman pesan .hapus

// Ekspor fungsi untuk menangani perintah
module.exports = (sock) => {
    sock.ev.on('messages.upsert', (message) => {
        const { messages, type } = message;
        if (type === 'notify') {
            const msg = messages[0];
            const text = msg.message.conversation;

            // Perintah untuk mengecek ID garansi
            if (text.startsWith('.garansiid ') && !isProcessingGaransiId) {
                isProcessingGaransiId = true; // Set flag untuk mencegah eksekusi ganda
                const parts = text.split(' ');
                if (parts.length === 2) {
                    const idGaransi = parts[1];

                    // Ambil kategori dan id_user dari tabel garansi
                    db.query('SELECT kategori, id_user FROM garansi WHERE id_garansi = ?', [idGaransi], (error, garansiResults) => {
                        isProcessingGaransiId = false; // Reset flag setelah query selesai
                        if (error) {
                            console.error('Error retrieving garansi:', error);
                            sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat memproses perintah.' });
                            return;
                        }

                        if (garansiResults.length > 0) {
                            const { kategori, id_user } = garansiResults[0];

                            if (kategori === 'youtube') {
                                // Ambil detail akun dari tabel akun_premium
                                db.query('SELECT detail_akun, id_akun FROM akun_premium WHERE kategori = "youtube" LIMIT 1', (error, accountResults) => {
                                    if (error) {
                                        console.error('Error retrieving account:', error);
                                        sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat memproses perintah.' });
                                        return;
                                    }

                                    if (accountResults.length > 0) {
                                        const { detail_akun, id_akun } = accountResults[0];

                                        // Update tabel garansi
                                        db.query('UPDATE garansi SET status = "success", akun_garansi = ? WHERE id_garansi = ?', [detail_akun, idGaransi], (error) => {
                                            if (error) {
                                                console.error('Error updating garansi:', error);
                                                sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat memperbarui garansi.' });
                                                return;
                                            }

                                            // Ambil nomor WhatsApp dari tabel users
                                            db.query('SELECT no_whatsapp FROM users WHERE id_user = ?', [id_user], (error, userResults) => {
                                                if (error) {
                                                    console.error('Error retrieving user:', error);
                                                    sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat memproses perintah.' });
                                                    return;
                                                }

                                                if (userResults.length > 0) {
                                                    const userNumber = userResults[0].no_whatsapp;

                                                    // Kirim detail akun ke nomor WhatsApp
                                                    sock.sendMessage(`${userNumber}@s.whatsapp.net`, { text: `Detail akun: ${detail_akun}` });

                                                    // Hapus akun dari tabel akun_premium
                                                    db.query('DELETE FROM akun_premium WHERE id_akun = ?', [id_akun], (error) => {
                                                        if (error) {
                                                            console.error('Error deleting account:', error);
                                                        }

                                                        // Kirim balasan sukses ke admin
                                                        sock.sendMessage(msg.key.remoteJid, { text: 'Sukses' });
                                                    });
                                                } else {
                                                    sock.sendMessage(msg.key.remoteJid, { text: 'Error: Nomor WhatsApp tidak ditemukan.' });
                                                }
                                            });
                                        });
                                    } else {
                                        sock.sendMessage(msg.key.remoteJid, { text: 'Error: Tidak ada akun dengan kategori youtube.' });
                                    }
                                });
                            } else {
                                sock.sendMessage(msg.key.remoteJid, { text: 'Kategori tidak sesuai dengan youtube.' });
                            }
                        } else {
                            sock.sendMessage(msg.key.remoteJid, { text: 'Error: ID garansi tidak ditemukan.' });
                        }
                    });
                } else {
                    sock.sendMessage(msg.key.remoteJid, { text: 'Format perintah tidak sesuai. Contoh: .garansiid 22' });
                }
            }

            // Tambah nomor yang dikecualikan
            if (text.startsWith('.tambah ')) {
                const parts = text.split(' ');
                if (parts.length === 2) {
                    const phoneNumber = parts[1] + '@s.whatsapp.net'; // Tambahkan @s.whatsapp.net

                    // Cek apakah nomor sudah ada di daftar dikecualikan
                    db.query('SELECT * FROM excluded_numbers WHERE phone_number = ?', [phoneNumber], (error, results) => {
                        if (error) {
                            console.error('Error checking excluded number:', error);
                            sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat memproses perintah.' });
                            return;
                        }

                        if (results.length > 0) {
                            // Jika nomor sudah ada, kirim pesan ke pengirim
                            sock.sendMessage(msg.key.remoteJid, { text: `Nomor ${phoneNumber} sudah ada dalam daftar dikecualikan.` });
                        } else {
                            // Jika nomor belum ada, tambahkan ke daftar
                            db.query('INSERT INTO excluded_numbers (phone_number) VALUES (?)', [phoneNumber], (error) => {
                                if (error) {
                                    console.error('Error adding excluded number:', error);
                                    sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat menambahkan nomor.' });
                                } else {
                                    // Kirim balasan sukses ke pengirim
                                    sock.sendMessage(msg.key.remoteJid, { text: `Nomor ${phoneNumber} berhasil ditambahkan ke daftar dikecualikan.` });
                                }
                            });
                        }
                    });
                } else {
                    sock.sendMessage(msg.key.remoteJid, { text: 'Format perintah tidak sesuai. Contoh: .tambah 6281271170051' });
                }
                return; // Hentikan eksekusi lebih lanjut
            }

            // Hapus nomor yang dikecualikan
            if (text.startsWith('.hapus ')) {
                const parts = text.split(' ');
                if (parts.length === 2) {
                    const phoneNumber = parts[1] + '@s.whatsapp.net'; // Tambahkan @s.whatsapp.net

                    // Cek apakah nomor sudah ada di daftar dikecualikan
                    db.query('SELECT * FROM excluded_numbers WHERE phone_number = ?', [phoneNumber], (error, results) => {
                        if (error) {
                            console.error('Error checking excluded number:', error);
                            sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat memproses perintah.' });
                            return;
                        }

                        if (results.length === 0) {
                            // Jika nomor tidak ada, kirim pesan ke pengirim
                            sock.sendMessage(msg.key.remoteJid, { text: `Nomor ${phoneNumber} tidak ditemukan dalam daftar dikecualikan.` });
                        } else {
                            // Jika nomor ada, hapus dari daftar
                            db.query('DELETE FROM excluded_numbers WHERE phone_number = ?', [phoneNumber], (error) => {
                                if (error) {
                                    console.error('Error deleting excluded number:', error);
                                    sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat menghapus nomor.' });
                                } else {
                                    // Kirim balasan sukses ke pengirim
                                    sock.sendMessage(msg.key.remoteJid, { text: `Nomor ${phoneNumber} berhasil dihapus dari daftar dikecualikan.` });
                                }
                            });
                        }
                    });
                } else {
                    sock.sendMessage(msg.key.remoteJid, { text: 'Format perintah tidak sesuai. Contoh: .hapus 6281271170051' });
                }
                return; // Hentikan eksekusi lebih lanjut
            }

            // Hapus semua nomor yang dikecualikan
            if (text.startsWith('.hapusall')) {
                db.query('DELETE FROM excluded_numbers', (error) => {
                    if (error) {
                        console.error('Error deleting all excluded numbers:', error);
                        sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat menghapus semua nomor.' });
                    } else {
                        sock.sendMessage(msg.key.remoteJid, { text: 'Semua nomor berhasil dihapus dari daftar dikecualikan.' });
                    }
                });
                return; // Hentikan eksekusi lebih lanjut
            }
        }
    });
};
