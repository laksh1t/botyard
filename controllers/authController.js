const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

exports.signup = async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and Password required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name",
            [email, hashedPassword, name]
        );
        res.json({ message: "User created successfully. You can now login." });
    } catch (e) {
        if (e.code === '23505') { // Postgres native unique constraint violation code
            return res.status(400).json({ error: "Email already exists" });
        }
        res.status(500).json({ error: "Signup failed", details: e.message });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and Password required" });

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { sub: String(user.id), email: user.email, name: user.name }, 
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, user: { id: String(user.id), email: user.email, name: user.name } });
    } catch (e) {
        res.status(500).json({ error: "Login failed", details: e.message });
    }
};
