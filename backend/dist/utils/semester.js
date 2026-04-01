"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCurrentWeek = calculateCurrentWeek;
const dayjs_1 = __importDefault(require("dayjs"));
function calculateCurrentWeek(startDate, totalWeeks, targetDate = new Date()) {
    const diffDays = (0, dayjs_1.default)(targetDate).startOf('day').diff((0, dayjs_1.default)(startDate).startOf('day'), 'day');
    const rawWeek = Math.floor(diffDays / 7) + 1;
    return Math.max(1, Math.min(rawWeek, totalWeeks));
}
