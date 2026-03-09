"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const [rows] = await database_1.default.execute('SELECT * FROM categories ORDER BY type, name');
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});
router.post('/', async (req, res) => {
    const { name, type, icon } = req.body;
    try {
        const [result] = await database_1.default.execute('INSERT INTO categories (name, type, icon) VALUES (?, ?, ?)', [name, type, icon || null]);
        res.status(201).json({ id: result.insertId, ...req.body });
    }
    catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});
exports.default = router;
