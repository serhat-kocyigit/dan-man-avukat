// =============================================
// HakPortal - Auth Middleware (JWT - MySQL uyumlu)
// =============================================
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
        return res.status(401).json({ error: 'Token gerekli.' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, email, role }
        next();
    } catch {
        return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
    }
};

const roleMiddleware = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Kimlik doğrulaması gerekli.' });
    if (!roles.includes(req.user.role))
        return res.status(403).json({ error: `Bu işlem için ${roles.join(' veya ')} yetkisi gerekli.` });
    next();
};

module.exports = { authMiddleware, roleMiddleware };
