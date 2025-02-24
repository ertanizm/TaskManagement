const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
});

const initDatabase = () => {
    // Veritabanını oluştur (eğer yoksa)
    connection.query('CREATE DATABASE IF NOT EXISTS is_takip', (err) => {
        if (err) {
            console.error('Veritabanı oluşturma hatası:', err);
            return;
        }
        
        // Veritabanını kullan
        connection.query('USE is_takip', (err) => {
            if (err) {
                console.error('Veritabanı seçme hatası:', err);
                return;
            }

            // Users tablosunu oluştur
            const createUsersTable = `
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    role ENUM('admin', 'employee') NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;

            // Tasks tablosunu oluştur
            const createTasksTable = `
                CREATE TABLE IF NOT EXISTS tasks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
                    status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
                    due_date DATE NOT NULL,
                    start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_date DATETIME,
                    assigned_user_id INT,
                    is_assigned TINYINT(1) DEFAULT 0,
                    active TINYINT(1) DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (assigned_user_id) REFERENCES users(id)
                )
            `;

            // Announcements tablosunu oluştur
            const createAnnouncementsTable = `
                CREATE TABLE IF NOT EXISTS announcements (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    start_date DATETIME NOT NULL,
                    end_date DATETIME NOT NULL,
                    type ENUM('sistem', 'acil', 'bilgi') NOT NULL DEFAULT 'bilgi',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `;

            // Services tablosunu oluştur
            const createServicesTable = `
                CREATE TABLE IF NOT EXISTS services (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    customer_name VARCHAR(255) NOT NULL,
                    phone VARCHAR(20) NOT NULL,
                    tax_office VARCHAR(100),
                    tax_number VARCHAR(50),
                    authorized_person VARCHAR(100) NOT NULL,
                    customer_request TEXT NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `;

            // Plannings tablosunu oluştur
            const createPlanningsTable = `
                CREATE TABLE IF NOT EXISTS plannings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    start_date DATETIME NOT NULL,
                    end_date DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `;

            // Requests tablosunu oluştur
            const createRequestsTable = `
                CREATE TABLE IF NOT EXISTS requests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    module ENUM('tekstil', 'muhasebe', 'restoran', 'hizlisatis', 'yeni') NOT NULL,
                    status ENUM('yeni', 'mevcut') NOT NULL DEFAULT 'yeni',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            connection.query(createUsersTable, (err) => {
                if (err) {
                    console.error('Users tablosu oluşturma hatası:', err);
                    return;
                }
                
                connection.query(createTasksTable, (err) => {
                    if (err) {
                        console.error('Tasks tablosu oluşturma hatası:', err);
                        return;
                    }
                    
                    connection.query(createAnnouncementsTable, (err) => {
                        if (err) {
                            console.error('Announcements tablosu oluşturma hatası:', err);
                            return;
                        }
                        console.log('Veritabanı ve tablolar başarıyla oluşturuldu');
                    });
                });
            });

            // Tabloyu oluştur
            connection.query(createServicesTable, (err) => {
                if (err) {
                    console.error('Services tablosu oluşturma hatası:', err);
                    return;
                }
                console.log('Services tablosu başarıyla oluşturuldu');
            });

            // Plannings tablosunu oluştur
            connection.query(createPlanningsTable, (err) => {
                if (err) {
                    console.error('Plannings tablosu oluşturma hatası:', err);
                    return;
                }
                console.log('Plannings tablosu başarıyla oluşturuldu');
            });

            // Requests tablosunu oluştur
            connection.query(createRequestsTable, (err) => {
                if (err) {
                    console.error('Requests tablosu oluşturma hatası:', err);
                    return;
                }
                console.log('Requests tablosu başarıyla oluşturuldu');
            });
        });
    });
};

// Veritabanı bağlantısını test et ve yapılandırmayı başlat
connection.connect((err) => {
    if (err) {
        console.error('Veritabanı bağlantı hatası:', err);
        return;
    }
    console.log('MySQL veritabanına bağlandı');
    initDatabase();
});

module.exports = connection; 