const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

// Veritabanı bağlantısını içe aktar
const connection = require('./database');

const app = express();

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'gizli-anahtar',
    resave: false,
    saveUninitialized: true
}));

// Routes
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        // Email kontrolü
        const checkEmail = 'SELECT * FROM users WHERE email = ?';
        connection.query(checkEmail, [email], async (err, results) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Sunucu hatası oluştu.' 
                });
            }
            
            if (results.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Bu e-posta adresi zaten kullanılıyor.' 
                });
            }

            // Şifreyi hashle
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Kullanıcıyı kaydet
            const sql = 'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)';
            connection.query(sql, [name, email, hashedPassword, role], (err, result) => {
                if (err) {
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Kayıt oluşturulurken hata oluştu.' 
                    });
                }
                
                res.json({ 
                    success: true, 
                    message: 'Kayıt başarıyla tamamlandı.' 
                });
            });
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Sunucu hatası oluştu.' 
        });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const sql = 'SELECT * FROM users WHERE email = ?';
        connection.query(sql, [email], async (err, results) => {
            if (err || results.length === 0) {
                return res.status(401).json({ 
                    success: false,
                    error: 'Geçersiz e-posta adresi'
                });
            }

            const user = results[0];
            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) {
                return res.status(401).json({ 
                    success: false,
                    error: 'Geçersiz şifre'
                });
            }

            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            };

            res.json({ 
                success: true,
                message: 'Giriş başarılı'
            });
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Sunucu hatası'
        });
    }
});

// Email kontrol route'u
app.get('/check-email', (req, res) => {
    const email = req.query.email;
    
    if (!email) {
        return res.status(400).json({ error: 'Email parametresi gerekli' });
    }

    const sql = 'SELECT * FROM users WHERE email = ?';
    connection.query(sql, [email], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Veritabanı hatası' });
        }
        
        res.json({ exists: results.length > 0 });
    });
});

// Dashboard route'u
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Kullanıcı bilgilerini getir
app.get('/api/user-info', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Oturum bulunamadı' });
    }
    res.json(req.session.user);
});

// Çıkış yap
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/tasks', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'tasks.html'));
});

// Görev oluşturma
app.post('/api/tasks', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    try {
        const { title, description, priority, due_date, assigned_user_id } = req.body;
        const user_id = req.session.user.id;
        const userRole = req.session.user.role;

        // Çalışan ise, görevi kendisine ata
        const assignedId = userRole === 'admin' ? assigned_user_id : user_id;
        const isAssigned = assigned_user_id ? 1 : 0;

        const sql = `INSERT INTO tasks (
            user_id, 
            title, 
            description, 
            priority, 
            due_date, 
            assigned_user_id,
            is_assigned
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        
        connection.query(sql, [
            user_id, 
            title, 
            description, 
            priority, 
            due_date, 
            assignedId,
            isAssigned
        ], (err, result) => {
            if (err) {
                console.error('Görev oluşturma hatası:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Görev oluşturulurken hata oluştu' 
                });
            }

            res.json({ 
                success: true, 
                message: 'Görev başarıyla oluşturuldu',
                taskId: result.insertId
            });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// Tamamlanan görevleri arşivle
app.post('/api/tasks/archive-completed', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const userId = req.session.user.id;

    const sql = `
        UPDATE tasks 
        SET active = 0 
        WHERE user_id = ? 
        AND status = 'completed' 
        AND active = 1
    `;

    connection.query(sql, [userId], (err, result) => {
        if (err) {
            console.error('Görev arşivleme hatası:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Görevler arşivlenirken hata oluştu' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Tamamlanan görevler arşivlendi',
            archivedCount: result.affectedRows
        });
    });
});

// Görevleri listele
app.get('/api/tasks', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    let sql = `
        SELECT t.*, 
               u.name as created_by,
               au.name as assigned_user_name,
               t.is_assigned
        FROM tasks t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users au ON t.assigned_user_id = au.id
        WHERE t.active = 1
    `;

    // Admin değilse sadece kendisine ait veya atanmış görevleri göster
    if (!isAdmin) {
        sql += ` AND (t.user_id = ? OR t.assigned_user_id = ?)`;
    }

    sql += ` ORDER BY t.start_date DESC`;

    const params = !isAdmin ? [userId, userId] : [];

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('Görev listeleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Görevler listelenirken hata oluştu'
            });
        }

        res.json({ success: true, tasks: results });
    });
});

// Görev durumunu güncelle
app.put('/api/tasks/:id/status', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const taskId = req.params.id;
    const { status } = req.body;
    const completed_date = status === 'completed' ? new Date() : null;

    const sql = `UPDATE tasks 
                SET status = ?, 
                    completed_date = ?
                WHERE id = ?`;

    connection.query(sql, [status, completed_date, taskId], (err) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                error: 'Görev güncellenirken hata oluştu' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Görev durumu güncellendi' 
        });
    });
});

// Görev güncelleme
app.put('/api/tasks/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const taskId = req.params.id;
    const { title, description, priority, due_date } = req.body;

    const sql = `UPDATE tasks 
                SET title = ?, 
                    description = ?, 
                    priority = ?, 
                    due_date = ?
                WHERE id = ?`;

    connection.query(sql, [title, description, priority, due_date, taskId], (err) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                error: 'Görev güncellenirken hata oluştu' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Görev başarıyla güncellendi' 
        });
    });
});

// Görev silme
app.delete('/api/tasks/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const taskId = req.params.id;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    let sql = 'DELETE FROM tasks WHERE id = ?';
    let params = [taskId];

    // Admin değilse sadece kendi görevlerini silebilir
    if (!isAdmin) {
        sql += ' AND user_id = ?';
        params.push(userId);
    }

    connection.query(sql, params, (err, result) => {
        if (err) {
            console.error('Görev silme hatası:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Görev silinirken hata oluştu' 
            });
        }

        if (result.affectedRows === 0) {
            return res.status(403).json({
                success: false,
                error: 'Bu görevi silme yetkiniz yok'
            });
        }

        res.json({ 
            success: true, 
            message: 'Görev başarıyla silindi' 
        });
    });
});

// Çalışanları getir
app.get('/api/users/employees', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(401).json({ success: false, error: 'Yetkisiz erişim' });
    }

    const sql = 'SELECT id, name FROM users WHERE role = "employee"';
    
    connection.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                error: 'Çalışanlar listelenirken hata oluştu' 
            });
        }

        res.json({ success: true, employees: results });
    });
});

// Duyuru oluşturma
app.post('/api/announcements', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const { title, description, start_date, end_date, type } = req.body;
    const user_id = req.session.user.id;

    const sql = `
        INSERT INTO announcements 
        (user_id, title, description, start_date, end_date, type) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    connection.query(sql, [user_id, title, description, start_date, end_date, type], (err, result) => {
        if (err) {
            console.error('Duyuru oluşturma hatası:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Duyuru oluşturulurken hata oluştu' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Duyuru başarıyla oluşturuldu',
            announcementId: result.insertId 
        });
    });
});

// Aktif duyuruları listele
app.get('/api/announcements', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    console.log('Şu anki tarih:', currentDate);

    const sql = `
        SELECT a.*, u.name as user_name 
        FROM announcements a
        JOIN users u ON a.user_id = u.id
        WHERE a.end_date >= ?
        ORDER BY 
            CASE a.type
                WHEN 'acil' THEN 1
                WHEN 'sistem' THEN 2
                WHEN 'bilgi' THEN 3
            END,
            a.created_at DESC
    `;

    connection.query(sql, [currentDate], (err, results) => {
        if (err) {
            console.error('Duyuru listeleme hatası:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Duyurular listelenirken hata oluştu' 
            });
        }

        console.log('Bulunan duyurular:', results);
        res.json({ success: true, announcements: results });
    });
});

// Duyuru silme (sadece admin ve duyuruyu oluşturan kullanıcı silebilir)
app.delete('/api/announcements/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const announcementId = req.params.id;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    let sql = 'DELETE FROM announcements WHERE id = ?';
    let params = [announcementId];

    if (!isAdmin) {
        sql += ' AND user_id = ?';
        params.push(userId);
    }

    connection.query(sql, params, (err, result) => {
        if (err) {
            console.error('Duyuru silme hatası:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Duyuru silinirken hata oluştu' 
            });
        }

        if (result.affectedRows === 0) {
            return res.status(403).json({ 
                success: false, 
                error: 'Bu duyuruyu silme yetkiniz yok' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Duyuru başarıyla silindi' 
        });
    });
});

// Duyuru güncelleme
app.put('/api/announcements/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const announcementId = req.params.id;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const { title, description, start_date, end_date, type } = req.body;

    let sql = `
        UPDATE announcements 
        SET title = ?, description = ?, start_date = ?, end_date = ?, type = ?
        WHERE id = ?
    `;
    let params = [title, description, start_date, end_date, type, announcementId];

    if (!isAdmin) {
        sql += ' AND user_id = ?';
        params.push(userId);
    }

    connection.query(sql, params, (err, result) => {
        if (err) {
            console.error('Duyuru güncelleme hatası:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Duyuru güncellenirken hata oluştu' 
            });
        }

        if (result.affectedRows === 0) {
            return res.status(403).json({ 
                success: false, 
                error: 'Bu duyuruyu güncelleme yetkiniz yok' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Duyuru başarıyla güncellendi' 
        });
    });
});

// Süresi geçmiş duyuruları temizle (Her saat başı çalışacak)
setInterval(() => {
    const sql = `DELETE FROM announcements WHERE end_date < NOW()`;
    
    connection.query(sql, (err, result) => {
        if (err) {
            console.error('Süresi geçmiş duyuruları silme hatası:', err);
            return;
        }
        if (result.affectedRows > 0) {
            console.log(`${result.affectedRows} adet süresi geçmiş duyuru silindi`);
        }
    });
}, 3600000); // Her saat (3600000 ms)

// Servis sayfası route'u
app.get('/service', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'service.html'));
});

// Servis API endpoint'leri
app.post('/api/services', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const {
        customer_name,
        phone,
        tax_office,
        tax_number,
        authorized_person,
        customer_request,
        description
    } = req.body;

    const sql = `
        INSERT INTO services (
            user_id,
            customer_name,
            phone,
            tax_office,
            tax_number,
            authorized_person,
            customer_request,
            description,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [
        req.session.user.id,
        customer_name,
        phone,
        tax_office,
        tax_number,
        authorized_person,
        customer_request,
        description
    ];

    connection.query(sql, values, (err, result) => {
        if (err) {
            console.error('Servis kaydetme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Servis kaydedilirken bir hata oluştu'
            });
        }

        res.json({
            success: true,
            message: 'Servis talebi başarıyla kaydedildi',
            serviceId: result.insertId
        });
    });
});

// Servisleri listele
app.get('/api/services', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const sql = `
        SELECT s.*, u.name as created_by
        FROM services s
        JOIN users u ON s.user_id = u.id
        ORDER BY s.created_at DESC
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Servis listeleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Servisler listelenirken hata oluştu'
            });
        }

        res.json({ success: true, services: results });
    });
});

// Servis silme endpoint'i
app.delete('/api/services/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const serviceId = req.params.id;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    let sql = 'DELETE FROM services WHERE id = ?';
    let params = [serviceId];

    // Admin değilse sadece kendi oluşturduğu servisleri silebilir
    if (!isAdmin) {
        sql += ' AND user_id = ?';
        params.push(userId);
    }

    connection.query(sql, params, (err, result) => {
        if (err) {
            console.error('Servis silme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Servis silinirken bir hata oluştu'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(403).json({
                success: false,
                error: 'Bu servisi silme yetkiniz yok'
            });
        }

        res.json({
            success: true,
            message: 'Servis başarıyla silindi'
        });
    });
});

// Planlama sayfası route'u
app.get('/calendar', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'calendar.html'));
});

// Planlama oluşturma
app.post('/api/plannings', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const { title, description, start_date, end_date } = req.body;
    const userId = req.session.user.id;

    const sql = `
        INSERT INTO plannings (user_id, title, description, start_date, end_date)
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(sql, [userId, title, description, start_date, end_date], (err, result) => {
        if (err) {
            console.error('Planlama kaydetme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Planlama kaydedilirken bir hata oluştu'
            });
        }

        res.json({
            success: true,
            message: 'Planlama başarıyla kaydedildi',
            planningId: result.insertId
        });
    });
});

// Planlamaları listele
app.get('/api/plannings', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    let sql = `
        SELECT p.*, u.name as user_name
        FROM plannings p
        JOIN users u ON p.user_id = u.id
    `;

    // Admin değilse sadece kendi planlamalarını göster
    if (!isAdmin) {
        sql += ` WHERE p.user_id = ? `;
    }

    sql += ` ORDER BY p.start_date ASC`;

    const params = !isAdmin ? [userId] : [];

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('Planlama listeleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Planlamalar listelenirken hata oluştu'
            });
        }

        const events = results.map(planning => ({
            id: planning.id,
            title: planning.title,
            description: planning.description,
            start: planning.start_date,
            end: planning.end_date,
            extendedProps: {
                user_name: planning.user_name
            }
        }));

        res.json({ success: true, plannings: events });
    });
});

// Planlama silme endpoint'i
app.delete('/api/plannings/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const planningId = req.params.id;
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    let sql = 'DELETE FROM plannings WHERE id = ?';
    let params = [planningId];

    // Admin değilse sadece kendi planlamalarını silebilir
    if (!isAdmin) {
        sql += ' AND user_id = ?';
        params.push(userId);
    }

    connection.query(sql, params, (err, result) => {
        if (err) {
            console.error('Planlama silme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Planlama silinirken bir hata oluştu'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(403).json({
                success: false,
                error: 'Bu planlamayı silme yetkiniz yok'
            });
        }

        res.json({
            success: true,
            message: 'Planlama başarıyla silindi'
        });
    });
});

// İstekler sayfası route'u
app.get('/requests', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'requests.html'));
});

// İstek oluşturma
app.post('/api/requests', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const { title, description, module, status } = req.body;

    const sql = `
        INSERT INTO requests (title, description, module, status)
        VALUES (?, ?, ?, ?)
    `;

    connection.query(sql, [title, description, module, status], (err, result) => {
        if (err) {
            console.error('İstek kaydetme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'İstek kaydedilirken bir hata oluştu'
            });
        }

        res.json({
            success: true,
            message: 'İstek başarıyla kaydedildi',
            requestId: result.insertId
        });
    });
});

// İstekleri listele
app.get('/api/requests', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const sql = `
        SELECT *
        FROM requests
        ORDER BY created_at DESC
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('İstek listeleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'İstekler listelenirken hata oluştu'
            });
        }

        res.json({ success: true, requests: results });
    });
});

// İstek silme endpoint'i
app.delete('/api/requests/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const requestId = req.params.id;

    const sql = 'DELETE FROM requests WHERE id = ?';

    connection.query(sql, [requestId], (err, result) => {
        if (err) {
            console.error('İstek silme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'İstek silinirken bir hata oluştu'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'İstek bulunamadı'
            });
        }

        res.json({
            success: true,
            message: 'İstek başarıyla silindi'
        });
    });
});

// Dashboard widget verileri için endpoint
app.get('/api/dashboard/stats', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    // SQL sorgularını hazırla
    let pendingTasksSQL = `
        SELECT COUNT(*) as count 
        FROM tasks 
        WHERE status = 'pending' AND active = 1
    `;

    let completedTasksSQL = `
        SELECT COUNT(*) as count 
        FROM tasks 
        WHERE status = 'completed' AND active = 1
    `;

    let requestsSQL = `
        SELECT COUNT(*) as count 
        FROM requests
    `;

    // Eğer admin değilse, sadece kendi görevlerini say
    if (!isAdmin) {
        pendingTasksSQL += ` AND (user_id = ? OR assigned_user_id = ?)`;
        completedTasksSQL += ` AND (user_id = ? OR assigned_user_id = ?)`;
    }

    // Tüm sorguları paralel çalıştır
    Promise.all([
        new Promise((resolve, reject) => {
            const params = !isAdmin ? [userId, userId] : [];
            connection.query(pendingTasksSQL, params, (err, results) => {
                if (err) reject(err);
                else resolve(results[0].count);
            });
        }),
        new Promise((resolve, reject) => {
            const params = !isAdmin ? [userId, userId] : [];
            connection.query(completedTasksSQL, params, (err, results) => {
                if (err) reject(err);
                else resolve(results[0].count);
            });
        }),
        new Promise((resolve, reject) => {
            connection.query(requestsSQL, (err, results) => {
                if (err) reject(err);
                else resolve(results[0].count);
            });
        })
    ])
    .then(([pendingTasks, completedTasks, requests]) => {
        res.json({
            success: true,
            stats: {
                pendingTasks,
                completedTasks,
                requests
            }
        });
    })
    .catch(error => {
        console.error('Dashboard istatistikleri hatası:', error);
        res.status(500).json({
            success: false,
            error: 'İstatistikler alınırken bir hata oluştu'
        });
    });
});

// Raporlar sayfası route'u
app.get('/reports', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'reports.html'));
});

// Bekleyen görevleri listele
app.get('/api/tasks/pending', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const sql = `
        SELECT t.*, 
               u.name as created_by,
               au.name as assigned_user_name
        FROM tasks t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users au ON t.assigned_user_id = au.id
        WHERE t.status = 'pending' 
        AND t.active = 1
        ORDER BY t.due_date ASC
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Bekleyen görevler listeleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Bekleyen görevler listelenirken hata oluştu'
            });
        }

        res.json({ success: true, tasks: results });
    });
});

// Devam eden görevleri listele
app.get('/api/tasks/in-progress', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const sql = `
        SELECT t.*, 
               u.name as created_by,
               au.name as assigned_user_name
        FROM tasks t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users au ON t.assigned_user_id = au.id
        WHERE t.status = 'in_progress' 
        AND t.active = 1
        ORDER BY t.due_date ASC
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Devam eden görevler listeleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Devam eden görevler listelenirken hata oluştu'
            });
        }

        res.json({ success: true, tasks: results });
    });
});

// Tamamlanan görevleri listele
app.get('/api/tasks/completed', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const sql = `
        SELECT t.*, 
               u.name as created_by,
               au.name as assigned_user_name
        FROM tasks t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users au ON t.assigned_user_id = au.id
        WHERE t.status = 'completed'
        ORDER BY t.completed_date DESC
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Tamamlanan görevler listeleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Tamamlanan görevler listelenirken hata oluştu'
            });
        }

        res.json({ success: true, tasks: results });
    });
});

// Tamamlanan görevleri temizle
app.post('/api/tasks/clear-completed', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const sql = 'DELETE FROM tasks WHERE status = "completed"';
    
    connection.query(sql, (err, result) => {
        if (err) {
            console.error('Görev temizleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Görevler temizlenirken bir hata oluştu'
            });
        }

        res.json({ success: true });
    });
});

// Duyuruları temizle
app.post('/api/announcements/clear', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const sql = 'DELETE FROM announcements';
    
    connection.query(sql, (err, result) => {
        if (err) {
            console.error('Duyuru temizleme hatası:', err);
            return res.status(500).json({
                success: false,
                error: 'Duyurular temizlenirken bir hata oluştu'
            });
        }

        res.json({ success: true });
    });
});

// Parola değiştir
app.post('/api/user/change-password', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Oturum bulunamadı' });
    }

    const { email, newPassword } = req.body;
    const userId = req.session.user.id;

    // Email kontrolü
    const checkEmailSql = 'SELECT * FROM users WHERE id = ? AND email = ?';
    connection.query(checkEmailSql, [userId, email], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Geçersiz e-posta adresi'
            });
        }

        // Yeni parolayı hashle
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Parolayı güncelle
        const updateSql = 'UPDATE users SET password = ? WHERE id = ?';
        connection.query(updateSql, [hashedPassword, userId], (err, result) => {
            if (err) {
                console.error('Parola güncelleme hatası:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Parola güncellenirken bir hata oluştu'
                });
            }

            res.json({ success: true });
        });
    });
});

// Ayarlar sayfası route'u
app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
}); 