const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET no configurado — la app no puede arrancar sin un secreto seguro');

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: !!user.must_change_password,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo administrador' });
  next();
}

module.exports = { signToken, requireAuth, requireAdmin, JWT_SECRET };
