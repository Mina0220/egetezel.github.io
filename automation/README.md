# WhatsApp Web medya indirme otomasyonu

Playwright tabanlı bu betik, WhatsApp Web oturumunu bir kez QR koduyla açıp depolanan oturum bilgisini şifreleyerek medya mesajlarını düzenli olarak indirir. İndirmeler SQLite veritabanına ve dosya sistemine kaydedilir, hata alan mesajlar yeniden denenir ve cron tabanlı tetikleyiciyle periyodik çalıştırma sağlanır.

## Kurulum
1. Node.js 18+ kurun.
2. Depodaki bağımlılıkları yüklemek için (ağ erişimi gerekebilir):
   ```bash
   npm install
   # Playwright'ın Chromium ikili dosyasını almak için:
   npx playwright install chromium
   ```
3. Gerekli dizinleri oluşturun (yoksa betik otomatik açar):
   ```bash
   mkdir -p secrets downloads automation
   ```

## Ortam değişkenleri
- `SESSION_SECRET` **zorunlu**: Oturum bilgisini AES-256-GCM ile şifrelemek için kullanılır.
- `WA_CRON` (varsayılan `*/30 * * * *`): Cron zamanlayıcı ifadesi.
- `WA_DOWNLOAD_DIR` (varsayılan `./downloads`): İndirme klasörü.
- `WA_STATE_PATH` (varsayılan `./secrets/wa_session.enc`): Şifrelenmiş oturum dosyası.
- `WA_DB_PATH` (varsayılan `./automation/downloads.db`): SQLite veritabanı yolu.
- `WA_SENDERS`: Virgülle ayrılmış gönderici adlarıyla filtre.
- `WA_MEDIA_TYPES`: `image,video,audio,document,sticker` değerlerinden biri veya fazlası.
- `WA_DATE_AFTER`: ISO formatlı tarih filtresi (örn. `2024-01-01`).
- `WA_RETRY_LIMIT`: Başarısız indirme için yeniden deneme sınırı (varsayılan `2`).
- `WA_LOGIN_TIMEOUT`, `WA_DOWNLOAD_TIMEOUT`: Süre aşımı değerleri (ms cinsinden).

## Çalıştırma
- Tek seferlik çalıştırma (otomatik oturum yenileme + indirme):
  ```bash
  SESSION_SECRET="güçlü-bir-sır" npm run whatsapp:run
  ```
- Zamanlanmış çalışma:
  ```bash
  SESSION_SECRET="güçlü-bir-sır" npm run whatsapp:schedule
  ```

İlk çalıştırmada QR kodu taramanız gerekir. Başarılı girişten sonra oturum durumu şifrelenip `secrets/wa_session.enc` dosyasına yazılır.

## İşleyiş
- Sayfada `data-testid="msg-container"` baloncukları taranır; indirme butonu olan medya baloncukları filtrelenir.
- Gönderici, tarih ve medya türü filtreleri DOM'dan elde edilen `data-pre-plain-text` metni ve `data-testid` ipuçlarıyla uygulanır.
- Her indirmede Playwright `download` olayı dinlenir, dosya hedef klasöre kaydedilir, günlük ve SQLite kaydı yapılır.
- `fs.watch` ile indirme klasörü gözlemlenir, yeni dosyalar log'lanır.
- İndirme hataları veritabanına `failed` durumu ve deneme sayısı ile yazılır; kronik hatalar `WA_RETRY_LIMIT` sınırına kadar yeniden denenir.
- Oturum süresi dolarsa veya cihaz ayrılırsa betik QR ekranını bekler; yeni oturumu yeniden şifreleyip diske kaydeder.

## Log ve veri saklama
- SQLite dosyası: `automation/downloads.db` (tablo: `downloads`).
- Şifreli oturum: `secrets/wa_session.enc` (AES-256-GCM, `SESSION_SECRET` ile çözümlenir).
- Opsiyonel log dosyası için terminal çıktısını yönlendirebilir veya sistemd/cron loglarına bakabilirsiniz.
