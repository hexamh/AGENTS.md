// ============================================================
// src/telegram.ts — Telegram Bot API client
// ============================================================

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
  document?: TelegramDocument;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// ── Telegram API Client ───────────────────────────────────────

export class TelegramClient {
  private baseUrl: string;

  constructor(token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(
    chatId: number,
    text: string,
    options: {
      parse_mode?: "Markdown" | "HTML" | "MarkdownV2";
      reply_markup?: InlineKeyboardMarkup;
      disable_web_page_preview?: boolean;
    } = {}
  ): Promise<void> {
    await this.call("sendMessage", {
      chat_id: chatId,
      text,
      ...options,
    });
  }

  async sendDocument(
    chatId: number,
    filename: string,
    content: string,
    caption?: string
  ): Promise<void> {
    const blob = new Blob([content], { type: "text/markdown" });
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("document", blob, filename);
    if (caption) formData.append("caption", caption);

    await fetch(`${this.baseUrl}/sendDocument`, {
      method: "POST",
      body: formData,
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  async sendChatAction(chatId: number, action: "typing"): Promise<void> {
    await this.call("sendChatAction", {
      chat_id: chatId,
      action,
    });
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: {
      parse_mode?: "Markdown" | "HTML";
      reply_markup?: InlineKeyboardMarkup;
    } = {}
  ): Promise<void> {
    await this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    });
  }

  private async call(method: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Telegram API error [${method}]:`, error);
    }
  }
}
