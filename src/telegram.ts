import type { AppEnv } from './config';

/** Send an HTML-formatted message to the configured Telegram chat via the Bot API. */
export async function sendTelegramMessage(env: AppEnv, html: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.telegramChatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: HTTP ${response.status} ${await response.text()}`);
  }
}
