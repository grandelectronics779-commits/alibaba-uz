# Alibaba.uz — O'zbek Proxy Sayt

## Bu nima?
`alibaba.uz` domeningizdan Alibaba.com ni to'liq o'zi kabi ochadi.
Faqat chat qismida o'zbek ↔ ingliz avtomatik tarjima ishlaydi.

---

## Vercel ga deploy qilish (5 daqiqa)

### 1. GitHub ga yuklang
```bash
git init
git add .
git commit -m "alibaba uz proxy"
git branch -M main
git remote add origin https://github.com/SIZNING_USERNAME/alibaba-uz.git
git push -u origin main
```

### 2. Vercel da deploy qiling
1. https://vercel.com ga kiring
2. "New Project" → GitHub repo ni tanlang
3. "Deploy" bosing — avtomatik deploy bo'ladi

### 3. Domenni ulang
Vercel dashboard → Settings → Domains:
- `alibaba.uz` ni qo'shing
- DNS provider da quyidagi record qo'shing:
  ```
  CNAME  @  cname.vercel-dns.com
  ```

---

## Ishlatish

1. `alibaba.uz` ni oching
2. Birinchi marta ochilganda **OpenAI API key** so'raladi
3. `sk-...` key ni kiriting → Saqlash
4. Alibaba odatdagidek ishlaydi
5. Chat oynasida **o'zbekcha yozing** → avtomatik inglizchaga tarjima bo'lib yuboriladi
6. Supplier inglizcha javob bersa → **o'zbekcha tarjima** pastida ko'rinadi

---

## Texnik tafsilot
- **Proxy**: Vercel serverless function orqali Alibaba.com ga barcha so'rovlar yo'naltiriladi
- **Tarjima**: OpenAI `gpt-4o-mini` modeli (tez va arzon)
- **API key**: Foydalanuvchi brauzerida `localStorage` da saqlanadi, serverga yuborilmaydi
- **Xavfsizlik**: Alibabaning cookie va session lari saqlanadi

---

## Muammo bo'lsa
- Alibaba ba'zi API lar uchun CORS qaytarishi mumkin — bu normal
- Login qilish uchun Alibaba akkauntingiz bo'lishi kerak
