/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { buildProviderChatCta, formatDelta, t as tPipeline, type GuardedDecode } from "@bills/pipeline";
import { formatDataSize, parseGb, type MergedExtraction } from "@bills/category-packs";
import { formatMoney, parseAmount, withinTolerance, type SupportedLocale } from "@bills/shared";
import { CopyButton } from "./copy-button.js";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBell,
  IconChart,
  IconCheckCircle,
  IconGlobe,
  IconLightbulb,
  IconMegaphone,
  IconPhoneCall,
  IconSparkles,
  IconTag,
  IconWallet,
} from "../../icons.js";

/** The invoice columns the summary renders — a narrow slice of the DB row. */
export interface SummaryInvoice {
  totalAmountMinor: number | null;
  dueDate: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

export const WEB_STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: { due: "Due", pastDue: "past due", lineItems: "What you're paying for", gotchas: "Worth knowing", savings: "Where you can save", printed: "Printed on your bill", perMonth: "/month", perYear: "/year", oneOff: "one-off", varies: "amount depends on usage", back: "Continue on WhatsApp", expiredTitle: "This link has expired", expiredBody: "Message us on WhatsApp again and we'll send a fresh one.", period: "Billing period", privacy: "This page is private to you. Nothing here is indexed or shared.", glance: "At a glance", saveUpTo: "Save up to {amount} a month", meterLow: "You pay for {allowance}, you use about {used}", meterOk: "You're using {pct}% of your allowance", meterHigh: "You're close to your limit — {pct}% used", printedAs: "on the bill: {v}", stDataUsed: "Data used", stOf: "of {n}", stMinutes: "Minutes used", stFee: "Plan fee", stSpeed: "Speed", stConsumption: "Consumption", meterCaption: "You're using {pct}% of your plan's data allowance", waSupportTitle: "{provider} has official WhatsApp support", waSupportBody: "Tap below to open a chat with them — your message asking for a better deal is already typed, you just press send.", waSupportCta: "Message {provider} on WhatsApp", smsSupportTitle: "{provider} offers support by text message", smsSupportBody: "Tap below on your phone — your message is pre-typed, you just press send.", smsSupportCta: "Text {provider} support", chatSupportTitle: "{provider} has online chat support", chatSupportBody: "Opens the provider's official support chat page — ask about better plans or discounts.", chatSupportCta: "Open {provider} support chat", pitchTitle: "Ask for a better deal", pitchBody: "We wrote the message for you — grounded in your bill and current market offers. Copy it or send it straight away.", pitchCopy: "Copy message", pitchCopied: "Copied ✓", pitchCallTitle: "Prefer to call? Read this script", pitchWebChatHint: "Copy the message, then open their official chat:", tagline: "Your bill, decoded", lastBill: "Latest bill", savePill: "Saving", usageTitle: "Data allowance used", usageWaste: "You're paying for data you don't use", usageFine: "Your plan fits your usage", usageTight: "You're close to your data limit", breakdownTitle: "Charge breakdown", brFixed: "Plan & fixed charges", brVariable: "Usage & out-of-bundle", brDiscounts: "Discounts applied", brCharges: "Charges", brTotal: "Total to pay", actionsTitle: "What to do next", actPay: "Pay {amount} by {date}", recTitle: "Recommended saving", recCta: "Check this plan", trendStable: "Stable", trendUp: "Went up", trendDown: "Went down" },
  es: { due: "Vence", pastDue: "vencido", lineItems: "Qué estás pagando", gotchas: "Conviene saber", savings: "Dónde puedes ahorrar", printed: "Impreso en tu factura", perMonth: "/mes", perYear: "/año", oneOff: "una vez", varies: "el importe depende del consumo", back: "Seguir en WhatsApp", expiredTitle: "Este enlace ha caducado", expiredBody: "Escríbenos de nuevo por WhatsApp y te enviamos uno nuevo.", period: "Periodo de facturación", privacy: "Esta página es privada. Nada aquí se indexa ni se comparte.", glance: "De un vistazo", saveUpTo: "Ahorra hasta {amount} al mes", meterLow: "Pagas por {allowance} y usas unos {used}", meterOk: "Estás usando el {pct}% de tu bono", meterHigh: "Casi al límite — {pct}% consumido", printedAs: "en la factura: {v}", stDataUsed: "Datos usados", stOf: "de {n}", stMinutes: "Minutos usados", stFee: "Cuota del plan", stSpeed: "Velocidad", stConsumption: "Consumo", meterCaption: "Estás usando el {pct}% de los datos de tu plan", waSupportTitle: "{provider} tiene atención oficial por WhatsApp", waSupportBody: "Toca abajo para abrir el chat — tu mensaje pidiendo una oferta mejor ya está escrito, solo pulsa enviar.", waSupportCta: "Escribir a {provider} por WhatsApp", smsSupportTitle: "{provider} atiende por SMS", smsSupportBody: "Toca abajo desde tu teléfono — tu mensaje ya está escrito, solo pulsa enviar.", smsSupportCta: "Enviar SMS a {provider}", chatSupportTitle: "{provider} tiene chat de atención en línea", chatSupportBody: "Abre la página oficial de chat del proveedor — pregunta por planes o descuentos mejores.", chatSupportCta: "Abrir el chat de {provider}", pitchTitle: "Pide una oferta mejor", pitchBody: "Hemos escrito el mensaje por ti — basado en tu factura y en ofertas actuales del mercado. Cópialo o envíalo directamente.", pitchCopy: "Copiar mensaje", pitchCopied: "Copiado ✓", pitchCallTitle: "¿Prefieres llamar? Lee este guion", pitchWebChatHint: "Copia el mensaje y abre su chat oficial:", tagline: "Tu factura, descifrada", lastBill: "Última factura", savePill: "Ahorro", usageTitle: "Consumo de tu bono de datos", usageWaste: "Pagas por datos que no usas", usageFine: "Tu plan encaja con tu consumo", usageTight: "Estás cerca del límite de datos", breakdownTitle: "Desglose del importe", brFixed: "Cuota y cargos fijos", brVariable: "Consumo y fuera de tarifa", brDiscounts: "Descuentos aplicados", brCharges: "Cargos", brTotal: "Total a pagar", actionsTitle: "Qué hacer ahora", actPay: "Pagar {amount} antes del {date}", recTitle: "Ahorro recomendado", recCta: "Ver esta tarifa", trendStable: "Estable", trendUp: "Ha subido", trendDown: "Ha bajado" },
  fr: { due: "Échéance", pastDue: "en retard", lineItems: "Ce que vous payez", gotchas: "Bon à savoir", savings: "Où économiser", printed: "Imprimé sur votre facture", perMonth: "/mois", perYear: "/an", oneOff: "une fois", varies: "montant selon la consommation", back: "Continuer sur WhatsApp", expiredTitle: "Ce lien a expiré", expiredBody: "Écrivez-nous à nouveau sur WhatsApp et nous vous en enverrons un autre.", period: "Période de facturation", privacy: "Cette page est privée. Rien n'est indexé ni partagé.", glance: "En un coup d'œil", saveUpTo: "Économisez jusqu'à {amount} par mois", meterLow: "Vous payez pour {allowance} et utilisez environ {used}", meterOk: "Vous utilisez {pct}% de votre forfait", meterHigh: "Proche de la limite — {pct}% utilisé", printedAs: "sur la facture : {v}", stDataUsed: "Données utilisées", stOf: "sur {n}", stMinutes: "Minutes utilisées", stFee: "Prix du forfait", stSpeed: "Débit", stConsumption: "Consommation", meterCaption: "Vous utilisez {pct}% des données de votre forfait", waSupportTitle: "{provider} propose un support officiel sur WhatsApp", waSupportBody: "Appuyez ci-dessous pour ouvrir la discussion — votre message demandant une meilleure offre est déjà rédigé, il ne reste qu'à envoyer.", waSupportCta: "Écrire à {provider} sur WhatsApp", smsSupportTitle: "{provider} répond par SMS", smsSupportBody: "Appuyez ci-dessous depuis votre téléphone — votre message est déjà rédigé, il ne reste qu'à envoyer.", smsSupportCta: "Envoyer un SMS à {provider}", chatSupportTitle: "{provider} propose un chat d'assistance en ligne", chatSupportBody: "Ouvre la page de chat officielle du fournisseur — demandez un meilleur forfait ou une remise.", chatSupportCta: "Ouvrir le chat {provider}", pitchTitle: "Demandez une meilleure offre", pitchBody: "Nous avons rédigé le message pour vous — fondé sur votre facture et les offres actuelles du marché. Copiez-le ou envoyez-le directement.", pitchCopy: "Copier le message", pitchCopied: "Copié ✓", pitchCallTitle: "Vous préférez appeler ? Lisez ce script", pitchWebChatHint: "Copiez le message, puis ouvrez leur chat officiel :", tagline: "Votre facture, décryptée", lastBill: "Dernière facture", savePill: "Économie", usageTitle: "Utilisation de votre forfait data", usageWaste: "Vous payez des données que vous n'utilisez pas", usageFine: "Votre forfait correspond à votre usage", usageTight: "Vous approchez de votre limite de données", breakdownTitle: "Détail du montant", brFixed: "Forfait et frais fixes", brVariable: "Consommation et hors forfait", brDiscounts: "Remises appliquées", brCharges: "Frais", brTotal: "Total à payer", actionsTitle: "À faire maintenant", actPay: "Payer {amount} avant le {date}", recTitle: "Économie recommandée", recCta: "Voir cette offre", trendStable: "Stable", trendUp: "En hausse", trendDown: "En baisse" },
  pt: { due: "Vencimento", pastDue: "em atraso", lineItems: "O que está a pagar", gotchas: "Vale a pena saber", savings: "Onde pode poupar", printed: "Impresso na sua fatura", perMonth: "/mês", perYear: "/ano", oneOff: "uma vez", varies: "o valor depende do consumo", back: "Continuar no WhatsApp", expiredTitle: "Este link expirou", expiredBody: "Escreva-nos novamente no WhatsApp e enviamos um novo.", period: "Período de faturação", privacy: "Esta página é privada. Nada aqui é indexado ou partilhado.", glance: "Num relance", saveUpTo: "Poupe até {amount} por mês", meterLow: "Paga por {allowance} e usa cerca de {used}", meterOk: "Está a usar {pct}% do seu plafond", meterHigh: "Perto do limite — {pct}% usado", printedAs: "na fatura: {v}", stDataUsed: "Dados usados", stOf: "de {n}", stMinutes: "Minutos usados", stFee: "Mensalidade do plano", stSpeed: "Velocidade", stConsumption: "Consumo", meterCaption: "Está a usar {pct}% dos dados do seu plano", waSupportTitle: "A {provider} tem apoio oficial por WhatsApp", waSupportBody: "Toque abaixo para abrir a conversa — a sua mensagem a pedir uma oferta melhor já está escrita, basta enviar.", waSupportCta: "Falar com a {provider} no WhatsApp", smsSupportTitle: "A {provider} atende por SMS", smsSupportBody: "Toque abaixo no seu telefone — a sua mensagem já está escrita, basta enviar.", smsSupportCta: "Enviar SMS à {provider}", chatSupportTitle: "A {provider} tem chat de apoio online", chatSupportBody: "Abre a página oficial de chat do fornecedor — pergunte por planos ou descontos melhores.", chatSupportCta: "Abrir o chat da {provider}", pitchTitle: "Peça uma oferta melhor", pitchBody: "Escrevemos a mensagem por si — com base na sua fatura e nas ofertas atuais do mercado. Copie-a ou envie-a diretamente.", pitchCopy: "Copiar mensagem", pitchCopied: "Copiado ✓", pitchCallTitle: "Prefere ligar? Leia este guião", pitchWebChatHint: "Copie a mensagem e abra o chat oficial:", tagline: "A sua fatura, descodificada", lastBill: "Última fatura", savePill: "Poupança", usageTitle: "Utilização do plafond de dados", usageWaste: "Está a pagar dados que não usa", usageFine: "O seu plano encaixa no seu consumo", usageTight: "Está perto do limite de dados", breakdownTitle: "Detalhe do valor", brFixed: "Mensalidade e encargos fixos", brVariable: "Consumo e fora do plafond", brDiscounts: "Descontos aplicados", brCharges: "Encargos", brTotal: "Total a pagar", actionsTitle: "O que fazer a seguir", actPay: "Pagar {amount} até {date}", recTitle: "Poupança recomendada", recCta: "Ver este plano", trendStable: "Estável", trendUp: "Subiu", trendDown: "Desceu" },
  de: { due: "Fällig", pastDue: "überfällig", lineItems: "Wofür Sie zahlen", gotchas: "Gut zu wissen", savings: "Wo Sie sparen können", printed: "Auf Ihrer Rechnung gedruckt", perMonth: "/Monat", perYear: "/Jahr", oneOff: "einmalig", varies: "Betrag hängt vom Verbrauch ab", back: "Weiter in WhatsApp", expiredTitle: "Dieser Link ist abgelaufen", expiredBody: "Schreiben Sie uns erneut auf WhatsApp und wir senden einen neuen.", period: "Abrechnungszeitraum", privacy: "Diese Seite ist privat. Nichts wird indexiert oder geteilt.", glance: "Auf einen Blick", saveUpTo: "Sparen Sie bis zu {amount} im Monat", meterLow: "Sie zahlen für {allowance} und nutzen etwa {used}", meterOk: "Sie nutzen {pct}% Ihres Volumens", meterHigh: "Fast am Limit — {pct}% verbraucht", printedAs: "auf der Rechnung: {v}", stDataUsed: "Verbrauchte Daten", stOf: "von {n}", stMinutes: "Verbrauchte Minuten", stFee: "Tarifpreis", stSpeed: "Geschwindigkeit", stConsumption: "Verbrauch", meterCaption: "Sie nutzen {pct}% des Datenvolumens Ihres Tarifs", waSupportTitle: "{provider} hat offiziellen WhatsApp-Support", waSupportBody: "Tippen Sie unten, um den Chat zu öffnen — Ihre Nachricht mit der Frage nach einem besseren Angebot ist schon fertig, nur noch senden.", waSupportCta: "{provider} auf WhatsApp schreiben", smsSupportTitle: "{provider} bietet Support per SMS", smsSupportBody: "Tippen Sie unten auf Ihrem Telefon — Ihre Nachricht ist schon fertig, nur noch senden.", smsSupportCta: "SMS an {provider} senden", chatSupportTitle: "{provider} hat Online-Chat-Support", chatSupportBody: "Öffnet die offizielle Support-Chat-Seite des Anbieters — fragen Sie nach besseren Tarifen oder Rabatten.", chatSupportCta: "{provider}-Chat öffnen", pitchTitle: "Fordern Sie ein besseres Angebot", pitchBody: "Wir haben die Nachricht für Sie geschrieben — gestützt auf Ihre Rechnung und aktuelle Marktangebote. Kopieren oder direkt senden.", pitchCopy: "Nachricht kopieren", pitchCopied: "Kopiert ✓", pitchCallTitle: "Lieber anrufen? Lesen Sie dieses Skript", pitchWebChatHint: "Nachricht kopieren, dann den offiziellen Chat öffnen:", tagline: "Ihre Rechnung, entschlüsselt", lastBill: "Letzte Rechnung", savePill: "Ersparnis", usageTitle: "Genutztes Datenvolumen", usageWaste: "Sie zahlen für Daten, die Sie nicht nutzen", usageFine: "Ihr Tarif passt zu Ihrem Verbrauch", usageTight: "Sie sind nah am Datenlimit", breakdownTitle: "Aufschlüsselung", brFixed: "Tarif & feste Posten", brVariable: "Verbrauch & außerhalb des Tarifs", brDiscounts: "Angewendete Rabatte", brCharges: "Posten", brTotal: "Gesamtbetrag", actionsTitle: "Nächste Schritte", actPay: "{amount} bis {date} zahlen", recTitle: "Empfohlene Ersparnis", recCta: "Diesen Tarif prüfen", trendStable: "Stabil", trendUp: "Gestiegen", trendDown: "Gesunken" },
  he: { due: "לתשלום עד", pastDue: "בפיגור", lineItems: "על מה אתם משלמים", gotchas: "כדאי לדעת", savings: "איפה אפשר לחסוך", printed: "מודפס על החשבון", perMonth: "/חודש", perYear: "/שנה", oneOff: "חד־פעמי", varies: "הסכום תלוי בשימוש", back: "להמשיך בוואטסאפ", expiredTitle: "הקישור פג תוקף", expiredBody: "כתבו לנו שוב ונשלח קישור חדש.", period: "תקופת חיוב", privacy: "הדף הזה פרטי עבורך. שום דבר כאן לא נסרק ולא משותף.", glance: "במבט מהיר", saveUpTo: "אפשר לחסוך עד {amount} בחודש", meterLow: "אתם משלמים על {allowance} ומשתמשים בכ־{used}", meterOk: "אתם משתמשים ב־{pct}% מהחבילה", meterHigh: "קרוב למיצוי — {pct}% נוצלו", printedAs: "בחשבון: {v}", stDataUsed: "שימוש בנתונים", stOf: "מתוך {n}", stMinutes: "דקות שיחה", stFee: "דמי מסלול", stSpeed: "מהירות", stConsumption: "צריכה", meterCaption: "אתם משתמשים ב־{pct}% מחבילת הנתונים שלכם", waSupportTitle: "ל{provider} יש שירות רשמי בוואטסאפ", waSupportBody: "הקישו למטה לפתיחת צ'אט — ההודעה שמבקשת הצעה טובה יותר כבר כתובה, נשאר רק לשלוח.", waSupportCta: "לכתוב ל{provider} בוואטסאפ", smsSupportTitle: "{provider} נותנת שירות ב־SMS", smsSupportBody: "הקישו למטה מהטלפון — ההודעה כבר כתובה, נשאר רק לשלוח.", smsSupportCta: "לשלוח SMS ל{provider}", chatSupportTitle: "ל{provider} יש צ'אט שירות מקוון", chatSupportBody: "נפתח דף הצ'אט הרשמי של הספק — שאלו על מסלולים או הנחות.", chatSupportCta: "לפתוח את הצ'אט של {provider}", pitchTitle: "בקשו הצעה טובה יותר", pitchBody: "כתבנו את ההודעה בשבילכם — מבוססת על החשבון שלכם ועל הצעות עדכניות בשוק. העתיקו או שלחו ישירות.", pitchCopy: "העתקת ההודעה", pitchCopied: "הועתק ✓", pitchCallTitle: "מעדיפים להתקשר? קראו את התסריט", pitchWebChatHint: "העתיקו את ההודעה ואז פתחו את הצ'אט הרשמי:", tagline: "מנתח החשבונות החכם שלך", lastBill: "חשבון אחרון", savePill: "חיסכון", usageTitle: "ניצול חבילת הגלישה", usageWaste: "אתם משלמים על נתונים שאתם לא מנצלים", usageFine: "החבילה מתאימה לשימוש שלכם", usageTight: "אתם קרובים למיצוי חבילת הגלישה", breakdownTitle: "פירוט החיובים", brFixed: "מסלול וחיובים קבועים", brVariable: "שימושים וחריגות", brDiscounts: "הנחות שהוחלו", brCharges: "חיובים", brTotal: "סה״כ לתשלום", actionsTitle: "מה לעשות עכשיו", actPay: "לשלם {amount} עד {date}", recTitle: "החיסכון המומלץ", recCta: "לבדוק את החבילה", trendStable: "יציב", trendUp: "עלה", trendDown: "ירד" },
  ru: { due: "Оплатить до", pastDue: "просрочено", lineItems: "За что вы платите", gotchas: "Стоит знать", savings: "Где можно сэкономить", printed: "Напечатано на счёте", perMonth: "/мес", perYear: "/год", oneOff: "разово", varies: "сумма зависит от потребления", back: "Продолжить в WhatsApp", expiredTitle: "Срок ссылки истёк", expiredBody: "Напишите нам ещё раз, и мы пришлём новую.", period: "Расчётный период", privacy: "Эта страница доступна только вам. Ничего не индексируется и не передаётся.", glance: "Кратко", stDataUsed: "Использовано данных", stOf: "из {n}", stMinutes: "Использовано минут", stFee: "Абонплата", stSpeed: "Скорость", stConsumption: "Потребление", saveUpTo: "Можно экономить до {amount} в месяц", meterLow: "Вы платите за {allowance}, а используете около {used}", meterOk: "Вы используете {pct}% пакета", meterHigh: "Вы близко к лимиту — израсходовано {pct}%", printedAs: "на счёте: {v}", meterCaption: "Вы используете {pct}% пакета данных вашего тарифа", waSupportTitle: "У {provider} есть официальная поддержка в WhatsApp", waSupportBody: "Нажмите ниже, чтобы открыть чат — сообщение с просьбой о лучших условиях уже написано, останется отправить.", waSupportCta: "Написать {provider} в WhatsApp", smsSupportTitle: "{provider} отвечает по SMS", smsSupportBody: "Нажмите ниже с телефона — сообщение уже готово, останется отправить.", smsSupportCta: "Отправить SMS в {provider}", chatSupportTitle: "У {provider} есть онлайн-чат", chatSupportBody: "Откроется официальная страница чата — спросите про более выгодные тарифы или скидки.", chatSupportCta: "Открыть чат {provider}", pitchTitle: "Попросите условия получше", pitchBody: "Мы написали сообщение за вас — на основе вашего счёта и актуальных предложений рынка. Скопируйте или отправьте сразу.", pitchCopy: "Скопировать сообщение", pitchCopied: "Скопировано ✓", pitchCallTitle: "Предпочитаете позвонить? Вот сценарий", pitchWebChatHint: "Скопируйте сообщение, затем откройте их официальный чат:", tagline: "Ваш счёт, расшифрованный", lastBill: "Последний счёт", savePill: "Экономия", usageTitle: "Использование пакета данных", usageWaste: "Вы платите за данные, которыми не пользуетесь", usageFine: "Тариф соответствует вашему потреблению", usageTight: "Вы близко к лимиту данных", breakdownTitle: "Из чего складывается сумма", brFixed: "Тариф и постоянные начисления", brVariable: "Потребление и сверх пакета", brDiscounts: "Применённые скидки", brCharges: "Начисления", brTotal: "Итого к оплате", actionsTitle: "Что делать дальше", actPay: "Оплатить {amount} до {date}", recTitle: "Рекомендуемая экономия", recCta: "Посмотреть этот тариф", trendStable: "Без изменений", trendUp: "Вырос", trendDown: "Снизился" },
  zh: { due: "缴费截止", pastDue: "已逾期", lineItems: "您在为什么付费", gotchas: "值得注意", savings: "可以省钱的地方", printed: "账单上印的说明", perMonth: "/月", perYear: "/年", oneOff: "一次性", varies: "金额取决于用量", back: "回到 WhatsApp 继续", expiredTitle: "此链接已过期", expiredBody: "再给我们发条消息，我们会发送新的链接。", period: "账单周期", privacy: "此页面仅您可见，不会被收录或分享。", glance: "一览", stDataUsed: "数据用量", stOf: "共 {n}", stMinutes: "通话分钟", stFee: "套餐月费", stSpeed: "网速", stConsumption: "用量", saveUpTo: "每月最多可省 {amount}", meterLow: "您在为 {allowance} 付费，实际只用了约 {used}", meterOk: "您已使用套餐的 {pct}%", meterHigh: "接近上限 — 已用 {pct}%", printedAs: "账单原文：{v}", meterCaption: "您已使用套餐数据的 {pct}%", waSupportTitle: "{provider} 提供官方 WhatsApp 客服", waSupportBody: "点击下方打开聊天 — 议价消息已为您写好，只需按发送。", waSupportCta: "在 WhatsApp 联系 {provider}", smsSupportTitle: "{provider} 提供短信客服", smsSupportBody: "在手机上点击下方 — 消息已写好，只需按发送。", smsSupportCta: "发短信给 {provider}", chatSupportTitle: "{provider} 提供在线客服", chatSupportBody: "打开运营商的官方客服页面 — 询问更优惠的套餐或折扣。", chatSupportCta: "打开 {provider} 在线客服", pitchTitle: "争取更好的条件", pitchBody: "我们已根据您的账单和当前市场行情写好消息。复制它，或直接发送。", pitchCopy: "复制消息", pitchCopied: "已复制 ✓", pitchCallTitle: "更想打电话？看看这份话术", pitchWebChatHint: "复制消息，然后打开他们的官方客服：", tagline: "读懂你的账单", lastBill: "最近一期账单", savePill: "省钱", usageTitle: "套餐数据使用情况", usageWaste: "您在为用不到的流量付费", usageFine: "套餐与您的用量相符", usageTight: "您已接近流量上限", breakdownTitle: "费用构成", brFixed: "套餐及固定费用", brVariable: "用量及套餐外费用", brDiscounts: "已生效折扣", brCharges: "费用合计", brTotal: "应付总额", actionsTitle: "接下来该做什么", actPay: "在 {date} 前支付 {amount}", recTitle: "推荐的省钱方案", recCta: "查看这个套餐", trendStable: "持平", trendUp: "上涨", trendDown: "下降" },
};

function Expired({ locale }: { locale: SupportedLocale }) {
  const s = WEB_STRINGS[locale];
  return (
    <main className="page expired">
      <h1>{s.expiredTitle}</h1>
      <p>{s.expiredBody}</p>
    </main>
  );
}

/**
 * The bill summary board (Figma "bill-analysis-fintech"): a three-column
 * dashboard on desktop that collapses to the mobile reading order below
 * 1100px. Pure presentation — every number it shows already passed the
 * guardrail sweep or is pure-code arithmetic over the extraction.
 */
export function SummaryView({
  invoice,
  guarded,
  extraction,
  locale,
}: {
  invoice: SummaryInvoice;
  guarded: GuardedDecode;
  extraction: MergedExtraction;
  locale: SupportedLocale;
}) {
  const s = WEB_STRINGS[locale];
  const currency = extraction.common.currency ?? "EUR";
  const money = (minor: number) => formatMoney({ amountMinor: minor, currency }, locale);
  const totalMinor = invoice.totalAmountMinor;
  const total = totalMinor !== null ? money(totalMinor) : (extraction.common.totalAmount ?? "—");
  const pitch = guarded.pitch;
  const chatCta = buildProviderChatCta(guarded, locale, pitch ? { message: pitch.chatMessage } : undefined);
  const ctaKey = chatCta?.channel === "sms" ? "sms" : chatCta?.channel === "web_chat" ? "chat" : "wa";

  // Headline value: the single largest verified monthly saving (never a sum —
  // levers can overlap), shown as "save up to X a month".
  const ranked = [...guarded.savings].sort(
    (a, b) => monthlyMinor(b) - monthlyMinor(a),
  );
  const topSaving = ranked.find((sv) => sv.amountMinor !== null) ?? null;
  const otherSavings = ranked.filter((sv) => sv !== topSaving);
  const topSavingMinor = topSaving ? monthlyMinor(topSaving) : null;

  const glance = computeGlance(extraction, s, locale);
  const rows = computeBreakdown(extraction, currency, totalMinor, s, locale);
  const trend = computeTrend(guarded.history ?? null);

  const actions: Array<{ icon: React.ReactNode; body: React.ReactNode }> = [];
  if (invoice.dueDate && totalMinor !== null) {
    actions.push({
      icon: <IconCheckCircle size={17} />,
      body: fillNodes(s.actPay!, { amount: total, date: invoice.dueDate }),
    });
  }
  const actionIcons = [<IconPhoneCall size={17} key="p" />, <IconTag size={17} key="t" />, <IconBell size={17} key="b" />];
  guarded.savings.forEach((sv, i) => {
    actions.push({ icon: actionIcons[i % actionIcons.length], body: <span dir="auto">{sv.nextStep}</span> });
  });

  return (
    <div className="sum" dir={locale === "he" ? "rtl" : undefined}>
      <header className="sum-top">
        <div className="in">
          <span className="sum-brand">
            <IconChart size={18} />
            SaveBills
          </span>
          <span className="sum-brand" style={{ fontWeight: 400, gap: 12 }}>
            <span className="sum-tagline">{s.tagline}</span>
            {extraction.common.providerName && (
              <span className="sum-provider" dir="auto">
                {extraction.common.providerName}
                <i className="dot" />
              </span>
            )}
          </span>
        </div>
      </header>

      <div className="sum-wrap">
        <div className="sum-grid">
          {/* ---------------- column A: the money ---------------- */}
          <div className="sum-col">
            <section className="sum-block b-hero">
              <div className="s-card s-hero">
                <div className="row">
                  <div>
                    <div className="cap">{s.lastBill}</div>
                    <div className="total">
                      <bdi>{total}</bdi>
                    </div>
                  </div>
                  <div className="meta">
                    {invoice.billingPeriodStart && invoice.billingPeriodEnd && (
                      <>
                        {s.period}
                        {/* A date range always reads left-to-right, even inside an RTL page. */}
                        <strong>
                          <bdi dir="ltr">
                            {invoice.billingPeriodStart} → {invoice.billingPeriodEnd}
                          </bdi>
                        </strong>
                      </>
                    )}
                  </div>
                </div>
                {invoice.dueDate && (
                  <div className="due">
                    <span>{s.due}</span>
                    <b>
                      <bdi>{invoice.dueDate}</bdi>
                    </b>
                  </div>
                )}
                {guarded.headline && <p className="headline">{guarded.headline}</p>}
              </div>
            </section>

            {topSavingMinor !== null && topSavingMinor > 0 && (
              <section className="sum-block b-save">
                <div className="s-banner">
                  <span className="left">
                    <span className="ico">
                      <IconSparkles size={18} />
                    </span>
                    <span className="txt">{fillNodes(s.saveUpTo!, { amount: money(topSavingMinor) })}</span>
                  </span>
                  <span className="pill">{s.savePill}</span>
                </div>
              </section>
            )}

            {glance.stats.length > 0 && (
              <section className="sum-block b-stats">
                <span className="s-label">{s.glance}</span>
                <div className="s-stats">
                  {glance.stats.map((st, i) => (
                    <div key={i} className="s-stat">
                      <span className="h">
                        {st.icon}
                        {st.label}
                      </span>
                      <span className="v" dir="auto">
                        <bdi>{st.value}</bdi>
                      </span>
                      {st.subTemplate && (
                        <span className="s" dir="auto">
                          {fillNodes(st.subTemplate, st.subValues ?? {})}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {actions.length > 0 && (
              <section className="sum-block b-actions">
                <span className="s-label">{s.actionsTitle}</span>
                <div className="s-stack">
                  {actions.map((a, i) => (
                    <div key={i} className="s-item">
                      <span className="ico">{a.icon}</span>
                      <span className="body">{a.body}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="sum-block b-cta">
              {chatCta ? (
                <a
                  className="s-cta"
                  href={chatCta.url}
                  {...(chatCta.channel === "sms" ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
                >
                  <IconMegaphone size={18} />
                  {fill(s[`${ctaKey}SupportCta`]!, chatCta.providerName)}
                </a>
              ) : (
                <a className="s-cta" href="https://wa.me/?text=">
                  <IconMegaphone size={18} />
                  {s.back}
                </a>
              )}
            </section>
          </div>

          {/* ---------------- column B: the bill itself ---------------- */}
          <div className="sum-col">
            {glance.meter && (
              <section className="sum-block b-usage">
                <span className="s-label">{s.usageTitle}</span>
                <div className="s-card s-usage">
                  <Ring pct={glance.meter.pct} label={glance.meter.pctLabel} severity={glance.meter.severity} />
                  <div className="txt">
                    <h4 dir="auto">
                      {glance.meter.severity === "low"
                        ? s.usageWaste
                        : glance.meter.severity === "high"
                          ? s.usageTight
                          : s.usageFine}
                    </h4>
                    <p dir="auto">{fillNodes(glance.meter.template, glance.meter.values)}</p>
                  </div>
                </div>
              </section>
            )}

            {trend && (
              <section className="sum-block b-trend">
                <span className="s-label">{tPipeline(locale, "histTitle")}</span>
                <div className="s-card s-trend">
                  <div className="head">
                    <span className="seq" dir="auto">
                      {trend.points
                        .map((p) => (p.totalMinor !== null ? money(p.totalMinor) : "—"))
                        .join(" → ")}
                    </span>
                    <span className={`s-pill ${trend.direction}`}>
                      {trend.direction === "up" ? s.trendUp : trend.direction === "down" ? s.trendDown : s.trendStable}
                    </span>
                  </div>
                  <div className="s-bars" aria-hidden="true">
                    {trend.points.map((p, i) => (
                      <span key={i}>
                        <i style={{ height: `${barHeight(p.totalMinor, trend.max)}%` }} />
                      </span>
                    ))}
                  </div>
                  {trend.deltaMinor !== null && trend.deltaMinor !== 0 && (
                    <p className="delta" dir="auto">
                      <b>{formatDelta(trend.deltaMinor, currency, locale)}</b>
                    </p>
                  )}
                  {trend.changes.length > 0 && (
                    <dl className="s-changes" dir="auto">
                      {trend.changes.map((c, i) => (
                        <div key={i}>
                          <dt>{tPipeline(locale, c.key)}</dt>
                          <dd>
                            {c.text}
                            {c.more > 0 && (
                              <bdi dir="ltr" className="more">
                                +{c.more}
                              </bdi>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </section>
            )}

            {rows.length > 0 && (
              <section className="sum-block b-break">
                <span className="s-label">{s.breakdownTitle}</span>
                <div className="s-card s-rows">
                  {rows.map((r, i) => (
                    <div key={i}>
                      {r.total && <div className="sep" />}
                      <div className={`r${r.credit ? " credit" : ""}${r.total ? " total" : ""}`}>
                        <span className="k">{r.label}</span>
                        <span className="v">
                          <bdi>{r.text}</bdi>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {extraction.common.lineItems.length > 0 && (
              <section className="sum-block b-items">
                <span className="s-label">{s.lineItems}</span>
                <div className="s-card">
                  <ul className="s-items">
                    {extraction.common.lineItems.map((item, i) => {
                      const translated = guarded.translation?.lineItemLabels[i];
                      const showOriginal = translated !== undefined && translated !== item.label;
                      const note = annotationFor(item.label, guarded);
                      return (
                        <li key={i}>
                          <span className="lbl" dir="auto">
                            {translated ?? item.label}
                            {showOriginal && <small dir="auto">{item.label}</small>}
                            {note && <small dir="auto">{note}</small>}
                          </span>
                          <span className="amt" dir="auto">
                            <bdi>{formatPrinted(item.amount, currency, locale)}</bdi>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            )}

            {guarded.printedNextSteps.length > 0 && (
              <section className="sum-block b-printed">
                <span className="s-label">{s.printed}</span>
                <div className="s-card">
                  <ul className="s-items">
                    {(guarded.translation ? extraction.common.printedNextSteps : guarded.printedNextSteps).map(
                      (step, i) => {
                        // Translations index against the EXTRACTION's steps, so
                        // render that list whenever a translation is present.
                        const translated = guarded.translation?.printedNextSteps[i];
                        const showOriginal = translated !== undefined && translated !== step;
                        return (
                          <li key={i}>
                            <span className="lbl" dir="auto">
                              {translated ?? step}
                              {showOriginal && <small dir="auto">{step}</small>}
                            </span>
                          </li>
                        );
                      },
                    )}
                  </ul>
                </div>
              </section>
            )}
          </div>

          {/* ---------------- column C: what to do about it ---------------- */}
          <div className="sum-col">
            {guarded.savings.length > 0 && (
              <section className="sum-block b-rec">
                <span className="s-label">{s.savings}</span>
                {topSaving && (
                  <div className="s-rec">
                    <div className="head">
                      <span className="left">
                        <span className="ico">
                          <IconLightbulb size={18} />
                        </span>
                        <h4 dir="auto">
                          {topSaving.offer ? `${topSaving.offer.provider} · ${topSaving.offer.name}` : s.recTitle}
                        </h4>
                      </span>
                      <span className="price">
                        <bdi>
                          {topSaving.offer
                            ? `${formatMoney({ amountMinor: topSaving.offer.estMonthlyCostMinor, currency: topSaving.currency }, locale)}${s.perMonth}`
                            : `−${formatMoney({ amountMinor: topSaving.amountMinor!, currency: topSaving.currency }, locale)}${
                                topSaving.period === "annual" ? s.perYear : topSaving.period === "monthly" ? s.perMonth : ` ${s.oneOff}`
                              }`}
                        </bdi>
                      </span>
                    </div>
                    <p dir="auto">{topSaving.explanation}</p>
                    <p dir="auto">{topSaving.nextStep}</p>
                    {topSaving.offer?.link && (
                      <p>
                        <a className="src" href={topSaving.offer.link} target="_blank" rel="noopener noreferrer nofollow">
                          {hostOf(topSaving.offer.link)}
                        </a>
                      </p>
                    )}
                    <a
                      className="btn"
                      href={topSaving.offer?.link ?? "#pitch"}
                      {...(topSaving.offer?.link ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
                    >
                      {s.recCta}
                    </a>
                  </div>
                )}
                {otherSavings.length > 0 && (
                  <div className="s-stack" style={{ marginTop: 10 }}>
                    {otherSavings.map((sv, i) => (
                      <div key={i} className="s-item">
                        <span className="ico">
                          <IconWallet size={17} />
                        </span>
                        <span className="body" dir="auto">
                          {sv.amountMinor !== null
                            ? `~${formatMoney({ amountMinor: sv.amountMinor, currency: sv.currency }, locale)}${
                                sv.period === "monthly" ? s.perMonth : sv.period === "annual" ? s.perYear : ` ${s.oneOff}`
                              }`
                            : sv.explanation}
                          <em dir="auto">{sv.amountMinor !== null ? sv.explanation : sv.nextStep}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {guarded.gotchas.length > 0 && (
              <section className="sum-block b-insights">
                <span className="s-label">{s.gotchas}</span>
                <div className="s-stack">
                  {guarded.gotchas.map((g) => (
                    <div key={g.checkId} className={`s-item ${g.severity}`}>
                      <span className="ico">
                        {g.severity === "alert" ? (
                          <IconAlertTriangle size={17} />
                        ) : g.severity === "warn" ? (
                          <IconAlertCircle size={17} />
                        ) : (
                          <IconGlobe size={17} />
                        )}
                      </span>
                      <span className="body" dir="auto">
                        {g.explanation}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {pitch && (
              <section className="sum-block b-pitch" id="pitch">
                <span className="s-label">{s.pitchTitle}</span>
                <div className="s-card">
                  <p style={{ margin: "0 0 12px", color: "var(--s-muted)", fontSize: "0.86rem", lineHeight: 1.6 }}>
                    {s.pitchBody}
                  </p>
                  <div className="terminal">
                    <div className="bar">
                      <span className="dot r" />
                      <span className="dot y" />
                      <span className="dot g" />
                    </div>
                    <div className="body" dir="auto">
                      {pitch.chatMessage}
                    </div>
                  </div>
                  <div className="s-actions-row">
                    <CopyButton className="s-btn" text={pitch.chatMessage} label={s.pitchCopy!} copiedLabel={s.pitchCopied!} />
                    {chatCta && (
                      <a
                        className="s-cta"
                        href={chatCta.url}
                        {...(chatCta.channel === "sms" ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
                      >
                        {fill(s[`${ctaKey}SupportCta`]!, chatCta.providerName)}
                      </a>
                    )}
                  </div>
                  {chatCta?.channel === "web_chat" && <p className="hint">{s.pitchWebChatHint}</p>}
                  {pitch.targetMonthlyMinor !== null && (
                    <p className="goal">
                      {tPipeline(locale, "pitchGoal", {
                        amount: formatMoney({ amountMinor: pitch.targetMonthlyMinor, currency: pitch.currency }, locale),
                      })}
                    </p>
                  )}
                  <details className="s-script">
                    <summary>
                      <IconPhoneCall size={16} />
                      {s.pitchCallTitle}
                    </summary>
                    <div className="script" dir="auto">
                      <p>{pitch.callScript.opening}</p>
                      <p className="ask">🗣 {pitch.callScript.openAsk}</p>
                      {pitch.callScript.onFirstOffer && (
                        <p>
                          <b>{tPipeline(locale, "pitchOnOffer")}</b> {pitch.callScript.onFirstOffer}
                        </p>
                      )}
                      {pitch.callScript.pushHarder.length > 0 && (
                        <ol>
                          {pitch.callScript.pushHarder.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ol>
                      )}
                      {pitch.callScript.evidence.length > 0 && (
                        <ul>
                          {pitch.callScript.evidence.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                      {pitch.callScript.objections.map((o, i) => (
                        <p key={i} className="obj">
                          ❓ <i>&ldquo;{o.ifTheySay}&rdquo;</i>
                          <br />→ <b>{o.youSay}</b>
                        </p>
                      ))}
                      <p>{pitch.callScript.closing}</p>
                      <p style={{ whiteSpace: "pre-wrap", color: "var(--s-muted)" }}>{tPipeline(locale, "pitchTips")}</p>
                    </div>
                  </details>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <footer className="sum-bottom">
        <div className="in">
          <span>{s.privacy}</span>
          {invoice.dueDate && (
            <span>
              {s.due}: <b><bdi>{invoice.dueDate}</bdi></b>
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

/** A saving normalised to a monthly figure, for ranking. 0 when unquantified. */
function monthlyMinor(sv: { amountMinor: number | null; period: string }): number {
  if (sv.amountMinor === null) return 0;
  return sv.period === "annual" ? Math.round(sv.amountMinor / 12) : sv.amountMinor;
}

/** A printed amount shown as money when it parses; the raw string otherwise. */
function formatPrinted(printed: string | null, currency: string, locale: SupportedLocale): string {
  if (!printed) return "";
  const minor = parseAmount(printed, currency);
  if (minor === null) return printed;
  // Credits render as a typographic minus in front of a positive amount, so
  // a printed "-49.89" never comes out doubly negated.
  const formatted = formatMoney({ amountMinor: Math.abs(minor), currency }, locale);
  return minor < 0 ? `\u2212${formatted}` : formatted;
}

function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

/** Donut ring: the Figma usage-visualization, drawn as a stroked SVG arc. */
function Ring({ pct, label, severity }: { pct: number; label: string; severity: "low" | "ok" | "high" }) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const arc = (Math.max(0, Math.min(100, pct)) / 100) * circumference;
  const stroke = severity === "high" ? "var(--s-rose)" : "var(--s-green)";
  return (
    <div className="s-ring">
      <svg viewBox="0 0 110 110" width="100%" height="100%" aria-hidden="true">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--s-border)" strokeWidth="9" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />
      </svg>
      <span className="pct">{label}%</span>
    </div>
  );
}

function fill(template: string, provider: string): string {
  return template.replaceAll("{provider}", provider);
}

/**
 * Render a template's {placeholders} with each value bidi-isolated, so a
 * quantity like "800 GB" keeps its unit attached inside RTL text instead of
 * being reordered to "GB 800".
 */
function fillNodes(template: string, values: Record<string, string>) {
  return template.split(/(\{[a-zA-Z]+\})/g).map((part, i) => {
    const key = part.match(/^\{([a-zA-Z]+)\}$/)?.[1];
    return key && values[key] !== undefined ? <bdi key={i}>{values[key]}</bdi> : <span key={i}>{part}</span>;
  });
}

interface GlanceStat {
  label: string;
  value: string;
  icon: React.ReactNode;
  subTemplate?: string;
  subValues?: Record<string, string>;
}

/**
 * The decision-relevant facts as big human numbers, plus the utilization
 * meter — low utilization is the money signal, so it gets its own card with
 * the verdict spelled out ("you pay for 800 GB, you use about 20 GB"), not a
 * hairline bar with a percentage.
 */
function computeGlance(
  extraction: { category: string; category_fields: unknown; common: { currency: string | null } },
  s: Record<string, string>,
  locale: SupportedLocale,
): {
  stats: GlanceStat[];
  meter: { pct: number; pctLabel: string; severity: "low" | "ok" | "high"; template: string; values: Record<string, string> } | null;
} {
  const fields =
    ((extraction.category_fields as Record<string, Record<string, unknown> | null>)[extraction.category] ??
      {}) as Record<string, unknown>;
  const printed = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const currency = extraction.common.currency ?? "EUR";
  const money = (raw: string | null): string | null => {
    if (!raw) return null;
    const minor = parseAmount(raw, currency);
    return minor === null ? raw : formatMoney({ amountMinor: minor, currency }, locale);
  };

  const stats: GlanceStat[] = [];
  let meter: {
    pct: number;
    pctLabel: string;
    severity: "low" | "ok" | "high";
    template: string;
    values: Record<string, string>;
  } | null = null;

  if (extraction.category === "mobile") {
    const usedPrinted = printed(fields.dataUsedGb);
    const allowancePrinted = printed(fields.dataAllowanceGb);
    const used = parseGb(usedPrinted);
    const allowance = parseGb(allowancePrinted);

    if (usedPrinted) {
      // One unit throughout: both sides of the comparison in GB. The bill's raw
      // MB string is deliberately NOT shown — "20182 MB of 800 GB" is unreadable.
      stats.push({
        label: s.stDataUsed!,
        icon: <IconGlobe size={13} />,
        value: allowancePrinted
          ? `${formatDataSize(usedPrinted)} / ${formatDataSize(allowancePrinted)}`
          : formatDataSize(usedPrinted),
      });
    }

    if (used !== null && allowance !== null && Number.isFinite(allowance) && allowance > 0) {
      const ratio = used / allowance;
      const exact = Math.min(100, ratio * 100);
      const pct = Math.round(exact);
      // Rounding 2.5% to "3%" throws away the whole point of the number, so
      // small percentages keep one decimal.
      const pctLabel = exact < 10 ? String(Math.round(exact * 10) / 10) : String(pct);
      const severity = ratio < 0.35 ? "low" : ratio > 0.9 ? "high" : "ok";
      const template = severity === "low" ? s.meterLow! : severity === "high" ? s.meterHigh! : s.meterOk!;
      const values: Record<string, string> =
        severity === "low"
          ? { allowance: formatDataSize(allowancePrinted), used: formatDataSize(usedPrinted) }
          : { pct: pctLabel };
      meter = { pct, pctLabel, severity, template, values };
      if (stats[0]) {
        stats[0].subTemplate = s.meterCaption!;
        stats[0].subValues = { pct: pctLabel };
      }
    }

    if (printed(fields.minutesUsed)) {
      stats.push({
        label: s.stMinutes!,
        icon: <IconPhoneCall size={13} />,
        value: printed(fields.minutesIncluded)
          ? `${printed(fields.minutesUsed)} / ${printed(fields.minutesIncluded)}`
          : printed(fields.minutesUsed)!,
      });
    }
    const fee = money(printed(fields.baseFee));
    if (fee) stats.push({ label: s.stFee!, icon: <IconTag size={13} />, value: fee });
  } else if (extraction.category === "energy") {
    if (printed(fields.usageKwh))
      stats.push({ label: s.stConsumption!, icon: <IconChart size={13} />, value: `${printed(fields.usageKwh)} kWh` });
    if (printed(fields.usageM3))
      stats.push({ label: s.stConsumption!, icon: <IconChart size={13} />, value: `${printed(fields.usageM3)} m³` });
  } else if (extraction.category === "broadband") {
    if (printed(fields.speedTier))
      stats.push({ label: s.stSpeed ?? "", icon: <IconGlobe size={13} />, value: printed(fields.speedTier)! });
    const price = money(printed(fields.monthlyPrice));
    if (price) stats.push({ label: s.stFee!, icon: <IconTag size={13} />, value: price });
  }

  return { stats, meter };
}

interface BreakdownRow {
  label: string;
  text: string;
  credit?: boolean;
  total?: boolean;
}

/**
 * "Charge breakdown": plan/fixed vs usage/variable vs discounts vs total.
 * Pure arithmetic over already-extracted amounts — but a decomposition that
 * doesn't reconcile with the printed total would be a lie dressed as a
 * summary, so a candidate is only shown when its parts add up to the total
 * within tolerance. Otherwise we fall back to what does reconcile, and in the
 * worst case to the total alone.
 */
function computeBreakdown(
  extraction: { category: string; category_fields: unknown; common: import("@bills/category-packs").CommonFields },
  currency: string,
  totalMinor: number | null,
  s: Record<string, string>,
  locale: SupportedLocale,
): BreakdownRow[] {
  const money = (minor: number) => formatMoney({ amountMinor: minor, currency }, locale);
  const num = (v: unknown): number | null =>
    typeof v === "string" && v.trim() ? parseAmount(v, currency) : null;
  const fields =
    ((extraction.category_fields as Record<string, Record<string, unknown> | null>)[extraction.category] ??
      {}) as Record<string, unknown>;

  const sum = (values: Array<number | null>): number | null => {
    const present = values.filter((v): v is number => v !== null);
    return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
  };

  let fixed: number | null = null;
  let variable: number | null = null;
  if (extraction.category === "mobile") {
    const addOns = (fields.addOns as Array<{ amount: string | null }> | undefined) ?? [];
    fixed = sum([num(fields.baseFee), ...addOns.map((a) => num(a.amount))]);
    variable = sum([num(fields.roamingCharges), num(fields.outOfBundleCharges)]);
  } else if (extraction.category === "broadband") {
    const equipment = (fields.equipmentFees as Array<{ amount: string | null }> | undefined) ?? [];
    fixed = sum([num(fields.monthlyPrice), ...equipment.map((e) => num(e.amount))]);
  }

  // Credits: applied printed discounts, else negative line items.
  const appliedDiscounts = sum(
    extraction.common.printedDiscounts.filter((d) => d.applied === true).map((d) => num(d.amount)),
  );
  const negativeItems = sum(
    extraction.common.lineItems.map((li) => num(li.amount)).filter((n) => n !== null && n < 0),
  );
  const credits =
    appliedDiscounts !== null && appliedDiscounts !== 0
      ? Math.abs(appliedDiscounts)
      : negativeItems !== null
        ? Math.abs(negativeItems)
        : null;

  const positiveItems = sum(
    extraction.common.lineItems.map((li) => num(li.amount)).filter((n) => n !== null && n > 0),
  );

  const reconciles = (parts: number) =>
    totalMinor !== null && withinTolerance(parts, totalMinor, currency);

  const candidates: BreakdownRow[][] = [];
  if (fixed !== null || variable !== null) {
    const parts = (fixed ?? 0) + (variable ?? 0) - (credits ?? 0);
    if (reconciles(parts)) {
      const rows: BreakdownRow[] = [];
      if (fixed !== null) rows.push({ label: s.brFixed!, text: money(fixed) });
      if (variable !== null) rows.push({ label: s.brVariable!, text: money(variable) });
      if (credits) rows.push({ label: s.brDiscounts!, text: `−${money(credits)}`, credit: true });
      candidates.push(rows);
    }
  }
  if (positiveItems !== null) {
    const parts = positiveItems - (credits ?? 0);
    if (reconciles(parts)) {
      const rows: BreakdownRow[] = [{ label: s.brCharges!, text: money(positiveItems) }];
      if (credits) rows.push({ label: s.brDiscounts!, text: `−${money(credits)}`, credit: true });
      candidates.push(rows);
    }
  }

  const rows = candidates[0];
  // Without a decomposition that reconciles, the card would just restate the
  // hero total — the line-item list below already carries the detail.
  if (!rows || rows.length < 2 || totalMinor === null) return [];
  rows.push({ label: s.brTotal!, text: money(totalMinor), total: true });
  return rows;
}

/**
 * Month-over-month trend: the sparkline points, the direction pill, and the
 * one-line diff. All values come from `bill-history` (pure code over prior
 * extractions), so nothing here needs the guardrail sweep.
 */
function computeTrend(
  history: import("@bills/pipeline").GuardedDecode["history"] | null,
): {
  points: Array<{ totalMinor: number | null }>;
  max: number;
  direction: "up" | "down" | "flat";
  deltaMinor: number | null;
  changes: Array<{ key: string; text: string; more: number }>;
} | null {
  if (!history || !history.vsPrevious || history.totalsTrend.length < 2) return null;
  const points = history.totalsTrend.slice(-6);
  const max = Math.max(...points.map((p) => p.totalMinor ?? 0), 1);
  const delta = history.vsPrevious.totalDeltaMinor;
  const direction = delta === null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";

  // A bill can change a dozen lines at once; listing them all turns the card
  // into a paragraph nobody reads. Name a few, count the rest.
  const MAX_NAMED = 3;
  const summarize = (items: Array<{ label: string }>) => ({
    text: items.slice(0, MAX_NAMED).map((it) => it.label.trim()).join(" · "),
    more: Math.max(0, items.length - MAX_NAMED),
  });
  const changes: Array<{ key: string; text: string; more: number }> = [];
  const { newItems, removedItems, changedItems } = history.vsPrevious;
  if (newItems.length > 0) changes.push({ key: "histNew", ...summarize(newItems) });
  if (removedItems.length > 0) changes.push({ key: "histGone", ...summarize(removedItems) });
  if (changedItems.length > 0) changes.push({ key: "histChanged", ...summarize(changedItems) });

  return { points, max, direction, deltaMinor: delta, changes };
}

/** Bar height as a percentage of the tallest bar, with a visible floor. */
function barHeight(minor: number | null, max: number): number {
  if (minor === null || max <= 0) return 14;
  return Math.max(14, Math.round((minor / max) * 100));
}

/** Match a section explanation to a line item by label mention (best-effort annotation). */
function annotationFor(
  label: string,
  guarded: { sections: Array<{ title: string; plainExplanation: string }> },
): string | null {
  const lower = label.toLowerCase();
  const hit = guarded.sections.find(
    (sec) => sec.title.toLowerCase().includes(lower) || sec.plainExplanation.toLowerCase().includes(lower),
  );
  return hit ? hit.plainExplanation : null;
}
