import type { Button } from "@bills/channel";
import { buildSmsLink, buildWaLink, formatMoney, type SupportedLocale } from "@bills/shared";
import type { GuardedDecode, GuardedSaving } from "./guardrails.js";

/**
 * Render the guarded decode into WhatsApp-sized messages. All strings are
 * either model output (already in the customer's language, already swept by
 * guardrails) or come from the locale tables below.
 */

const STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    fullBreakdown: "Full breakdown",
    buttonsBody: "What next?",
    explainMore: "Explain more",
    showSavings: "Show savings",
    actOnThis: "Act on this",
    savingsIntro: "Here's where your money can come back:",
    perMonth: "per month",
    perYear: "per year",
    oneOff: "one-off",
    noNumber: "amount depends on your usage",
    actWaitlist: "Automatic negotiation is coming soon — for now, here's exactly what to do:",
    noMoreDetail: "That's everything on this bill — send me the next one whenever you like!",
    unreadable: "I couldn't read that bill clearly 😕 — could you try a sharper photo, or send the PDF version?",
    thatsAll: "That's all",
    gotPage: "Got page {n} ✅ — send more pages, or tap when done.",
    analyzing: "Looks like that's everything — analyzing your bill now 🔎 (about a minute)",
    providerWaCta: "💬 {provider} has official WhatsApp support — tap to open the chat with your message already typed:",
    providerWaDraft:
      "Hello! I'm a {provider} customer. I've been reviewing my latest bill and would like to know if there's a better plan, discount or offer available for me. Thank you!",
    providerSmsCta: "📱 {provider} offers support by text message — text {number} from your phone and ask about better plans or discounts.",
    providerSmsCtaKeyword: "📱 {provider} offers support by text message — text \"{keyword}\" to {number} from your phone.",
    providerChatCta: "💻 {provider} has official online chat support:",
    pitchIntro: "📣 Here's your ready-to-send message asking for a better deal — copy it, or use the link below:",
    pitchSmsCta: "📱 Send the message above by text to {number} — that's {provider}'s official support line.",
    pitchWebChatHint: "💻 Copy the message above, then paste it into {provider}'s official chat:",
    pitchCall: "Prefer to call? Read this:",
    histDelta: "{delta} vs your previous bill",
    retainAsk: "One more thing: want me to keep your decoded bill data (encrypted — never the photos) so I can compare your future bills month to month? Otherwise it's deleted in 7 days. Type \"delete\" anytime to erase everything.",
    retainYesBtn: "Yes, keep it",
    retainNoBtn: "No — 7 days only",
    retainSaved: "Saved ✅ — I'll keep your decoded data (encrypted) and compare each new bill with the last ones. Type \"delete\" anytime to erase everything.",
    retainDeclined: "Understood 👍 — everything is deleted 7 days after each analysis.",
    histNew: "New this cycle",
    histGone: "No longer billed",
    histChanged: "Changed since last bill",
    histData: "Data used",
    histKwh: "Consumption",
    histTitle: "Compared with your previous bill",
    pitchOnOffer: "When they make an offer:",
    pitchGoal: "🎯 Your private goal: {amount}/month. Let THEM make the first offer — never say this number first. Judge every offer against it.",
    pitchTips:
      "💡 Pro tips from professional negotiators:\n• Call by phone on a weekday if you can — phone agents unlock better discounts than chat.\n• Never accept the first offer. Ask \"Is that the best you can do?\" — then stay silent.\n• Offers vary by agent. If you get nothing, hang up and try again another day.\n• Only mention cancelling if you could genuinely switch — bluffs get called.\n• When any promo ends, call again. Renegotiating every 6–12 months is normal.",
  },
  es: {
    fullBreakdown: "Desglose completo",
    buttonsBody: "¿Qué hacemos?",
    explainMore: "Explícame más",
    showSavings: "Ver ahorros",
    actOnThis: "Actuar",
    savingsIntro: "Aquí es donde puedes recuperar dinero:",
    perMonth: "al mes",
    perYear: "al año",
    oneOff: "una vez",
    noNumber: "el importe depende de tu consumo",
    actWaitlist: "La negociación automática llega pronto — de momento, esto es exactamente lo que hay que hacer:",
    noMoreDetail: "Eso es todo en esta factura — ¡envíame la siguiente cuando quieras!",
    unreadable: "No pude leer bien la factura 😕 — ¿puedes probar con una foto más nítida o enviar el PDF?",
    thatsAll: "Es todo",
    gotPage: "Página {n} recibida ✅ — envía más páginas o pulsa al terminar.",
    analyzing: "Parece que está todo — analizando tu factura 🔎 (un minuto aprox.)",
    providerWaCta: "💬 {provider} tiene atención oficial por WhatsApp — toca para abrir el chat con tu mensaje ya escrito:",
    providerWaDraft:
      "¡Hola! Soy cliente de {provider}. He estado revisando mi última factura y me gustaría saber si hay un plan, descuento u oferta mejor disponible para mí. ¡Gracias!",
    providerSmsCta: "📱 {provider} atiende por SMS — envía un mensaje al {number} desde tu teléfono y pregunta por planes o descuentos mejores.",
    providerSmsCtaKeyword: "📱 {provider} atiende por SMS — envía \"{keyword}\" al {number} desde tu teléfono.",
    providerChatCta: "💻 {provider} tiene chat de atención oficial en línea:",
    pitchIntro: "📣 Aquí tienes tu mensaje listo para pedir una oferta mejor — cópialo o usa el enlace de abajo:",
    pitchSmsCta: "📱 Envía el mensaje de arriba por SMS al {number} — es la línea oficial de {provider}.",
    pitchWebChatHint: "💻 Copia el mensaje de arriba y pégalo en el chat oficial de {provider}:",
    pitchCall: "¿Prefieres llamar? Lee esto:",
    histDelta: "{delta} respecto a tu factura anterior",
    retainAsk: "Una cosa más: ¿quieres que guarde los datos descifrados de tu factura (cifrados — nunca las fotos) para comparar tus próximas facturas mes a mes? Si no, se borran en 7 días. Escribe \"borrar\" cuando quieras para eliminarlo todo.",
    retainYesBtn: "Sí, guárdalo",
    retainNoBtn: "No — solo 7 días",
    retainSaved: "Guardado ✅ — conservaré tus datos (cifrados) y compararé cada factura nueva con las anteriores. Escribe \"borrar\" cuando quieras para eliminarlo todo.",
    retainDeclined: "Entendido 👍 — todo se borra a los 7 días de cada análisis.",
    histNew: "Nuevo este ciclo",
    histGone: "Ya no se factura",
    histChanged: "Cambió desde la última factura",
    histData: "Datos usados",
    histKwh: "Consumo",
    histTitle: "Comparado con tu factura anterior",
    pitchOnOffer: "Cuando te hagan una oferta:",
    pitchGoal: "🎯 Tu objetivo privado: {amount}/mes. Deja que ELLOS hagan la primera oferta — nunca digas esta cifra primero. Compara cada oferta con ella.",
    pitchTips:
      "💡 Consejos de negociadores profesionales:\n• Llama por teléfono en día laborable — los agentes telefónicos tienen mejores descuentos que el chat.\n• Nunca aceptes la primera oferta. Pregunta \"¿Es lo mejor que puede hacer?\" — y guarda silencio.\n• Las ofertas dependen del agente. Si no consigues nada, cuelga y vuelve a llamar otro día.\n• Solo menciona darte de baja si de verdad podrías cambiarte — detectan los faroles.\n• Cuando termine una promoción, vuelve a llamar. Renegociar cada 6–12 meses es normal.",
  },
  fr: {
    fullBreakdown: "Détail complet",
    buttonsBody: "On fait quoi ?",
    explainMore: "En savoir plus",
    showSavings: "Voir les économies",
    actOnThis: "Agir",
    savingsIntro: "Voici où récupérer de l'argent :",
    perMonth: "par mois",
    perYear: "par an",
    oneOff: "une fois",
    noNumber: "le montant dépend de votre consommation",
    actWaitlist: "La négociation automatique arrive bientôt — en attendant, voici exactement quoi faire :",
    noMoreDetail: "C'est tout pour cette facture — envoyez-moi la prochaine quand vous voulez !",
    unreadable: "Je n'ai pas pu lire la facture 😕 — une photo plus nette ou le PDF ?",
    thatsAll: "C'est tout",
    gotPage: "Page {n} reçue ✅ — envoyez d'autres pages ou appuyez quand c'est fini.",
    analyzing: "Ça semble complet — analyse de votre facture en cours 🔎 (environ une minute)",
    providerWaCta: "💬 {provider} propose un support officiel sur WhatsApp — appuyez pour ouvrir la discussion avec votre message déjà rédigé :",
    providerWaDraft:
      "Bonjour ! Je suis client de {provider}. En relisant ma dernière facture, j'aimerais savoir s'il existe un forfait, une remise ou une offre plus avantageuse pour moi. Merci !",
    providerSmsCta: "📱 {provider} répond par SMS — envoyez un message au {number} depuis votre téléphone pour demander un meilleur forfait ou une remise.",
    providerSmsCtaKeyword: "📱 {provider} répond par SMS — envoyez \"{keyword}\" au {number} depuis votre téléphone.",
    providerChatCta: "💻 {provider} propose un chat d'assistance officiel en ligne :",
    pitchIntro: "📣 Voici votre message prêt à envoyer pour demander une meilleure offre — copiez-le ou utilisez le lien ci-dessous :",
    pitchSmsCta: "📱 Envoyez le message ci-dessus par SMS au {number} — la ligne officielle de {provider}.",
    pitchWebChatHint: "💻 Copiez le message ci-dessus, puis collez-le dans le chat officiel de {provider} :",
    pitchCall: "Vous préférez appeler ? Lisez ceci :",
    histDelta: "{delta} par rapport à votre facture précédente",
    retainAsk: "Une dernière chose : voulez-vous que je conserve vos données de facture décodées (chiffrées — jamais les photos) pour comparer vos prochaines factures mois par mois ? Sinon, tout est supprimé sous 7 jours. Écrivez \"supprimer\" à tout moment pour tout effacer.",
    retainYesBtn: "Oui, conserver",
    retainNoBtn: "Non — 7 jours",
    retainSaved: "Enregistré ✅ — je conserve vos données (chiffrées) et je comparerai chaque nouvelle facture aux précédentes. Écrivez \"supprimer\" à tout moment.",
    retainDeclined: "Compris 👍 — tout est supprimé 7 jours après chaque analyse.",
    histNew: "Nouveau ce cycle",
    histGone: "Plus facturé",
    histChanged: "A changé depuis la dernière facture",
    histData: "Données utilisées",
    histKwh: "Consommation",
    histTitle: "Par rapport à votre facture précédente",
    pitchOnOffer: "Quand ils font une offre :",
    pitchGoal: "🎯 Votre objectif privé : {amount}/mois. Laissez-LES faire la première offre — ne donnez jamais ce chiffre en premier. Jugez chaque offre par rapport à lui.",
    pitchTips:
      "💡 Conseils de négociateurs professionnels :\n• Appelez par téléphone en semaine — les conseillers au téléphone débloquent de meilleures remises que le chat.\n• N'acceptez jamais la première offre. Demandez « C'est vraiment votre meilleure offre ? » — puis silence.\n• Les offres dépendent du conseiller. Si vous n'obtenez rien, raccrochez et rappelez un autre jour.\n• Ne parlez de résilier que si vous pourriez vraiment partir — les bluffs sont démasqués.\n• Quand une promo se termine, rappelez. Renégocier tous les 6–12 mois est normal.",
  },
  pt: {
    fullBreakdown: "Detalhe completo",
    buttonsBody: "O que fazemos?",
    explainMore: "Explicar mais",
    showSavings: "Ver poupanças",
    actOnThis: "Agir",
    savingsIntro: "Aqui é onde pode recuperar dinheiro:",
    perMonth: "por mês",
    perYear: "por ano",
    oneOff: "uma vez",
    noNumber: "o valor depende do seu consumo",
    actWaitlist: "A negociação automática chega em breve — por agora, é isto que deve fazer:",
    noMoreDetail: "É tudo nesta fatura — envie a próxima quando quiser!",
    unreadable: "Não consegui ler bem a fatura 😕 — pode tentar uma foto mais nítida ou enviar o PDF?",
    thatsAll: "É tudo",
    gotPage: "Página {n} recebida ✅ — envie mais páginas ou toque quando terminar.",
    analyzing: "Parece estar tudo — a analisar a sua fatura 🔎 (cerca de um minuto)",
    providerWaCta: "💬 A {provider} tem apoio oficial por WhatsApp — toque para abrir a conversa com a sua mensagem já escrita:",
    providerWaDraft:
      "Olá! Sou cliente da {provider}. Estive a rever a minha última fatura e gostaria de saber se há um plano, desconto ou oferta melhor disponível para mim. Obrigado!",
    providerSmsCta: "📱 A {provider} atende por SMS — envie uma mensagem para {number} do seu telefone e pergunte por planos ou descontos melhores.",
    providerSmsCtaKeyword: "📱 A {provider} atende por SMS — envie \"{keyword}\" para {number} do seu telefone.",
    providerChatCta: "💻 A {provider} tem chat de apoio oficial online:",
    pitchIntro: "📣 Aqui está a sua mensagem pronta a enviar para pedir uma oferta melhor — copie-a ou use o link abaixo:",
    pitchSmsCta: "📱 Envie a mensagem acima por SMS para {number} — a linha oficial da {provider}.",
    pitchWebChatHint: "💻 Copie a mensagem acima e cole-a no chat oficial da {provider}:",
    pitchCall: "Prefere ligar? Leia isto:",
    histDelta: "{delta} face à sua fatura anterior",
    retainAsk: "Só mais uma coisa: quer que guarde os dados descodificados da fatura (encriptados — nunca as fotos) para comparar as suas próximas faturas mês a mês? Caso contrário, tudo é apagado em 7 dias. Escreva \"apagar\" em qualquer altura para eliminar tudo.",
    retainYesBtn: "Sim, guardar",
    retainNoBtn: "Não — só 7 dias",
    retainSaved: "Guardado ✅ — vou manter os seus dados (encriptados) e comparar cada fatura nova com as anteriores. Escreva \"apagar\" em qualquer altura.",
    retainDeclined: "Entendido 👍 — tudo é apagado 7 dias após cada análise.",
    histNew: "Novo neste ciclo",
    histGone: "Já não é faturado",
    histChanged: "Mudou desde a última fatura",
    histData: "Dados usados",
    histKwh: "Consumo",
    histTitle: "Comparado com a sua fatura anterior",
    pitchOnOffer: "Quando fizerem uma oferta:",
    pitchGoal: "🎯 O seu objetivo privado: {amount}/mês. Deixe que sejam ELES a fazer a primeira oferta — nunca diga este número primeiro. Compare cada oferta com ele.",
    pitchTips:
      "💡 Dicas de negociadores profissionais:\n• Ligue por telefone num dia útil — os agentes telefónicos têm melhores descontos do que o chat.\n• Nunca aceite a primeira oferta. Pergunte \"É mesmo o melhor que consegue fazer?\" — e fique em silêncio.\n• As ofertas variam por agente. Se não conseguir nada, desligue e volte a ligar noutro dia.\n• Só fale em cancelar se pudesse mesmo mudar — os bluffs são descobertos.\n• Quando uma promoção terminar, ligue de novo. Renegociar a cada 6–12 meses é normal.",
  },
  de: {
    fullBreakdown: "Vollständige Aufschlüsselung",
    buttonsBody: "Wie weiter?",
    explainMore: "Mehr erklären",
    showSavings: "Sparpotenzial",
    actOnThis: "Handeln",
    savingsIntro: "Hier können Sie Geld zurückholen:",
    perMonth: "pro Monat",
    perYear: "pro Jahr",
    oneOff: "einmalig",
    noNumber: "Betrag hängt vom Verbrauch ab",
    actWaitlist: "Automatische Verhandlung kommt bald — bis dahin ist genau das zu tun:",
    noMoreDetail: "Das ist alles auf dieser Rechnung — schicken Sie mir jederzeit die nächste!",
    unreadable: "Ich konnte die Rechnung nicht gut lesen 😕 — ein schärferes Foto oder das PDF?",
    thatsAll: "Das ist alles",
    gotPage: "Seite {n} erhalten ✅ — weitere Seiten senden oder tippen, wenn fertig.",
    analyzing: "Sieht vollständig aus — Rechnung wird analysiert 🔎 (ca. eine Minute)",
    providerWaCta: "💬 {provider} hat offiziellen WhatsApp-Support — tippen Sie, um den Chat mit Ihrer fertigen Nachricht zu öffnen:",
    providerWaDraft:
      "Hallo! Ich bin Kunde bei {provider}. Ich habe meine letzte Rechnung geprüft und würde gerne wissen, ob es einen besseren Tarif, Rabatt oder ein besseres Angebot für mich gibt. Danke!",
    providerSmsCta: "📱 {provider} bietet Support per SMS — schreiben Sie an {number} und fragen Sie nach besseren Tarifen oder Rabatten.",
    providerSmsCtaKeyword: "📱 {provider} bietet Support per SMS — senden Sie \"{keyword}\" an {number}.",
    providerChatCta: "💻 {provider} hat offiziellen Online-Chat-Support:",
    pitchIntro: "📣 Hier ist Ihre fertige Nachricht für ein besseres Angebot — kopieren Sie sie oder nutzen Sie den Link unten:",
    pitchSmsCta: "📱 Senden Sie die Nachricht oben per SMS an {number} — die offizielle Support-Nummer von {provider}.",
    pitchWebChatHint: "💻 Kopieren Sie die Nachricht oben und fügen Sie sie im offiziellen Chat von {provider} ein:",
    pitchCall: "Lieber anrufen? Lesen Sie das:",
    histDelta: "{delta} gegenüber Ihrer letzten Rechnung",
    retainAsk: "Noch etwas: Soll ich Ihre entschlüsselten Rechnungsdaten (verschlüsselt — nie die Fotos) behalten, um künftige Rechnungen Monat für Monat zu vergleichen? Sonst wird alles nach 7 Tagen gelöscht. Schreiben Sie jederzeit \"löschen\", um alles zu entfernen.",
    retainYesBtn: "Ja, behalten",
    retainNoBtn: "Nein — nur 7 Tage",
    retainSaved: "Gespeichert ✅ — ich behalte Ihre Daten (verschlüsselt) und vergleiche jede neue Rechnung mit den vorherigen. Schreiben Sie jederzeit \"löschen\".",
    retainDeclined: "Verstanden 👍 — alles wird 7 Tage nach jeder Analyse gelöscht.",
    histNew: "Neu in diesem Zyklus",
    histGone: "Nicht mehr berechnet",
    histChanged: "Seit der letzten Rechnung geändert",
    histData: "Datenverbrauch",
    histKwh: "Verbrauch",
    histTitle: "Im Vergleich zu Ihrer letzten Rechnung",
    pitchOnOffer: "Wenn ein Angebot kommt:",
    pitchGoal: "🎯 Ihr privates Ziel: {amount}/Monat. Lassen Sie die GEGENSEITE das erste Angebot machen — nennen Sie diese Zahl nie zuerst. Messen Sie jedes Angebot daran.",
    pitchTips:
      "💡 Tipps von Profi-Verhandlern:\n• Rufen Sie werktags an — Telefon-Agenten haben bessere Rabatte als der Chat.\n• Nehmen Sie nie das erste Angebot an. Fragen Sie „Ist das wirklich Ihr bestes Angebot?“ — dann schweigen.\n• Angebote hängen vom Agenten ab. Bei nichts: auflegen, an einem anderen Tag erneut anrufen.\n• Kündigung nur erwähnen, wenn Sie wirklich wechseln könnten — Bluffs fliegen auf.\n• Wenn eine Aktion ausläuft: wieder anrufen. Alle 6–12 Monate neu zu verhandeln ist normal.",
  },
  he: {
    fullBreakdown: "הפירוט המלא",
    buttonsBody: "מה עכשיו?",
    explainMore: "הסבר נוסף",
    showSavings: "אפשרויות חיסכון",
    actOnThis: "לפעולה",
    savingsIntro: "כאן אפשר להחזיר כסף:",
    perMonth: "לחודש",
    perYear: "לשנה",
    oneOff: "חד־פעמי",
    noNumber: "הסכום תלוי בשימוש שלך",
    actWaitlist: "משא ומתן אוטומטי יגיע בקרוב — בינתיים, זה בדיוק מה שכדאי לעשות:",
    noMoreDetail: "זה הכול בחשבון הזה — שלחו לי את הבא מתי שתרצו!",
    unreadable: "לא הצלחתי לקרוא את החשבון 😕 — אפשר צילום חד יותר, או גרסת PDF?",
    thatsAll: "זה הכול",
    gotPage: "עמוד {n} התקבל ✅ — שלחו עמודים נוספים או הקישו בסיום.",
    analyzing: "נראה שזה הכול — מנתח את החשבון 🔎 (בערך דקה)",
    providerWaCta: "💬 ל{provider} יש שירות לקוחות רשמי בוואטסאפ — הקישו לפתיחת הצ'אט עם ההודעה שלכם כבר כתובה:",
    providerWaDraft:
      "שלום! אני לקוח/ה של {provider}. עברתי על החשבון האחרון שלי ואשמח לדעת אם יש מסלול, הנחה או הצעה משתלמת יותר עבורי. תודה!",
    providerSmsCta: "📱 {provider} נותנת שירות ב־SMS — שלחו הודעה למספר {number} ושאלו על מסלולים או הנחות טובים יותר.",
    providerSmsCtaKeyword: "📱 {provider} נותנת שירות ב־SMS — שלחו \"{keyword}\" למספר {number}.",
    providerChatCta: "💻 ל{provider} יש צ'אט שירות רשמי:",
    pitchIntro: "📣 הנה ההודעה המוכנה שלכם לבקשת הצעה טובה יותר — העתיקו אותה או השתמשו בקישור למטה:",
    pitchSmsCta: "📱 שלחו את ההודעה שלמעלה ב־SMS למספר {number} — קו השירות הרשמי של {provider}.",
    pitchWebChatHint: "💻 העתיקו את ההודעה שלמעלה והדביקו אותה בצ'אט הרשמי של {provider}:",
    pitchCall: "מעדיפים להתקשר? קראו את זה:",
    histDelta: "{delta} לעומת החשבון הקודם",
    retainAsk: "עוד דבר אחד: לשמור את נתוני החשבון המפוענחים (מוצפנים — לעולם לא התמונות) כדי שאוכל להשוות חשבונות עתידיים חודש מול חודש? אחרת הכול נמחק תוך 7 ימים. כתבו \"מחק\" בכל רגע כדי למחוק הכול.",
    retainYesBtn: "כן, לשמור",
    retainNoBtn: "לא — 7 ימים בלבד",
    retainSaved: "נשמר ✅ — אשמור את הנתונים (מוצפנים) ואשווה כל חשבון חדש לקודמים. כתבו \"מחק\" בכל רגע כדי למחוק הכול.",
    retainDeclined: "הבנתי 👍 — הכול נמחק 7 ימים אחרי כל ניתוח.",
    histNew: "חדש במחזור הזה",
    histGone: "כבר לא מחויב",
    histChanged: "השתנה מהחשבון הקודם",
    histData: "שימוש בנתונים",
    histKwh: "צריכה",
    histTitle: "בהשוואה לחשבון הקודם",
    pitchOnOffer: "כשהם מציעים הצעה:",
    pitchGoal: "🎯 היעד הפרטי שלך: {amount} לחודש. תנו להם להציע ראשונים — לעולם אל תגידו את המספר הזה קודם. שפטו כל הצעה מולו.",
    pitchTips:
      "💡 טיפים ממשא־ומתנים מקצועיים:\n• התקשרו בטלפון ביום חול — לנציגים בטלפון יש הנחות טובות יותר מבצ'אט.\n• לעולם אל תקבלו את ההצעה הראשונה. שאלו \"זה הכי טוב שאתם יכולים להציע?\" — ואז שתקו.\n• ההצעות תלויות בנציג. לא קיבלתם כלום? נתקו ונסו שוב ביום אחר.\n• דברו על ביטול רק אם באמת תוכלו לעבור — בלופים נחשפים.\n• כשמבצע נגמר — התקשרו שוב. משא ומתן כל 6–12 חודשים זה נורמלי.",
  },
  ru: {
    fullBreakdown: "Полная расшифровка",
    buttonsBody: "Что дальше?",
    explainMore: "Подробнее",
    showSavings: "Где сэкономить",
    actOnThis: "Действовать",
    savingsIntro: "Вот где можно вернуть деньги:",
    perMonth: "в месяц",
    perYear: "в год",
    oneOff: "разово",
    noNumber: "сумма зависит от вашего потребления",
    actWaitlist: "Автоматические переговоры скоро появятся — а пока вот что нужно сделать:",
    noMoreDetail: "Это всё по этому счёту — присылайте следующий, когда захотите!",
    unreadable: "Не удалось разобрать счёт 😕 — пришлите фото почётче или PDF.",
    thatsAll: "Это всё",
    gotPage: "Страница {n} получена ✅ — пришлите ещё или нажмите, когда закончите.",
    analyzing: "Похоже, это всё — анализирую ваш счёт 🔎 (около минуты)",
    providerWaCta: "💬 У {provider} есть официальная поддержка в WhatsApp — нажмите, чтобы открыть чат с готовым сообщением:",
    providerWaDraft:
      "Здравствуйте! Я клиент {provider}. Просматриваю свой последний счёт и хотел бы узнать, есть ли для меня более выгодный тариф, скидка или предложение. Спасибо!",
    providerSmsCta: "📱 {provider} отвечает по SMS — напишите на {number} и спросите про более выгодные тарифы или скидки.",
    providerSmsCtaKeyword: "📱 {provider} отвечает по SMS — отправьте \"{keyword}\" на {number}.",
    providerChatCta: "💻 У {provider} есть официальный онлайн-чат:",
    pitchIntro: "📣 Вот готовое сообщение с просьбой о более выгодных условиях — скопируйте его или используйте ссылку ниже:",
    pitchSmsCta: "📱 Отправьте сообщение выше по SMS на {number} — официальная линия {provider}.",
    pitchWebChatHint: "💻 Скопируйте сообщение выше и вставьте его в официальный чат {provider}:",
    pitchCall: "Предпочитаете позвонить? Прочитайте это:",
    histDelta: "{delta} по сравнению с прошлым счётом",
    retainAsk: "Ещё одно: сохранить расшифрованные данные счёта (в зашифрованном виде — никогда сами фото), чтобы сравнивать будущие счета месяц к месяцу? Иначе всё удалится через 7 дней. Напишите \"удалить\" в любой момент, чтобы стереть всё.",
    retainYesBtn: "Да, сохранить",
    retainNoBtn: "Нет — только 7 дней",
    retainSaved: "Сохранено ✅ — буду хранить данные (зашифрованно) и сравнивать каждый новый счёт с прошлыми. Напишите \"удалить\" в любой момент.",
    retainDeclined: "Понятно 👍 — всё удаляется через 7 дней после каждого анализа.",
    histNew: "Новое в этом периоде",
    histGone: "Больше не начисляется",
    histChanged: "Изменилось с прошлого счёта",
    histData: "Использовано данных",
    histKwh: "Потребление",
    histTitle: "По сравнению с прошлым счётом",
    pitchOnOffer: "Когда они сделают предложение:",
    pitchGoal: "🎯 Ваша личная цель: {amount} в месяц. Пусть ОНИ назовут цену первыми — никогда не называйте эту сумму сами. Сверяйте с ней каждое предложение.",
    pitchTips:
      "💡 Советы профессиональных переговорщиков:\n• Звоните по телефону в будний день — у операторов на телефоне скидки лучше, чем в чате.\n• Никогда не соглашайтесь на первое предложение. Спросите «Это лучшее, что вы можете предложить?» — и молчите.\n• Предложения зависят от оператора. Ничего не дали — положите трубку и позвоните в другой день.\n• Говорите об отключении, только если действительно готовы уйти — блеф распознают.\n• Когда акция заканчивается — звоните снова. Пересматривать раз в 6–12 месяцев — это нормально.",
  },
  zh: {
    fullBreakdown: "完整明细",
    buttonsBody: "接下来做什么？",
    explainMore: "更多说明",
    showSavings: "查看省钱方案",
    actOnThis: "立即行动",
    savingsIntro: "这些地方可以省回钱：",
    perMonth: "每月",
    perYear: "每年",
    oneOff: "一次性",
    noNumber: "金额取决于您的用量",
    actWaitlist: "自动协商功能即将推出 — 目前请按以下步骤操作：",
    noMoreDetail: "这张账单就这些了 — 随时把下一张发给我！",
    unreadable: "我看不清这张账单 😕 — 可以拍得更清晰一些，或发送 PDF 版本吗？",
    thatsAll: "就这些",
    gotPage: "已收到第 {n} 页 ✅ — 继续发送其他页面，完成后请点击。",
    analyzing: "看起来齐了 — 正在分析您的账单 🔎（约一分钟）",
    providerWaCta: "💬 {provider} 提供官方 WhatsApp 客服 — 点击打开聊天，消息已为您写好：",
    providerWaDraft:
      "您好！我是 {provider} 的客户。我查看了最近的账单，想了解是否有更划算的套餐、折扣或优惠。谢谢！",
    providerSmsCta: "📱 {provider} 提供短信客服 — 用手机发送短信至 {number}，询问更优惠的套餐或折扣。",
    providerSmsCtaKeyword: "📱 {provider} 提供短信客服 — 发送「{keyword}」至 {number}。",
    providerChatCta: "💻 {provider} 提供官方在线客服：",
    pitchIntro: "📣 这是为您写好的议价消息 — 复制它，或使用下面的链接：",
    pitchSmsCta: "📱 将上面的消息以短信发送至 {number} — 这是 {provider} 的官方客服号码。",
    pitchWebChatHint: "💻 复制上面的消息，然后粘贴到 {provider} 的官方在线客服：",
    pitchCall: "更想打电话？请照着念：",
    histDelta: "较上期账单 {delta}",
    retainAsk: "还有一件事：要我保留解读后的账单数据吗（加密保存 — 绝不保存照片），这样就能逐月对比您以后的账单。否则 7 天后全部删除。随时输入「删除」即可清空全部数据。",
    retainYesBtn: "好，保留",
    retainNoBtn: "不用 — 只存 7 天",
    retainSaved: "已保存 ✅ — 我会加密保留您的数据，并把每张新账单与之前的对比。随时输入「删除」即可清空。",
    retainDeclined: "明白 👍 — 每次分析后 7 天全部删除。",
    histNew: "本期新增",
    histGone: "不再收费",
    histChanged: "较上期有变化",
    histData: "数据用量",
    histKwh: "用量",
    histTitle: "与上期账单对比",
    pitchOnOffer: "当对方给出方案时：",
    pitchGoal: "🎯 您的心理目标价：每月 {amount}。让对方先开价 — 千万不要先说出这个数字。用它来衡量每个方案。",
    pitchTips:
      "💡 专业谈判者的建议：\n• 尽量在工作日打电话 — 电话客服能给的折扣比在线客服更多。\n• 绝不接受第一个方案。问一句「这是您能给的最好条件吗？」— 然后保持沉默。\n• 方案因客服而异。没谈成就挂断，改天再打。\n• 只有真的可以转网时才提取消 — 虚张声势会被识破。\n• 优惠到期就再打一次。每 6–12 个月重新议价很正常。",
  },
};

export function t(locale: SupportedLocale, key: string, vars: Record<string, string | number> = {}): string {
  let s = STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function periodLabel(locale: SupportedLocale, period: GuardedSaving["period"]): string {
  return t(locale, period === "monthly" ? "perMonth" : period === "annual" ? "perYear" : "oneOff");
}

/** Signed "+8,09 €" / "−3,20 €" for month-over-month deltas (code-computed). */
export function formatDelta(deltaMinor: number, currency: string, locale: SupportedLocale): string {
  const sign = deltaMinor > 0 ? "+" : deltaMinor < 0 ? "−" : "±";
  return `${sign}${formatMoney({ amountMinor: Math.abs(deltaMinor), currency }, locale)}`;
}

/** Message 1: the tidy summary + signed link. Kept well under WhatsApp's 4096-char cap. */
export function buildSummaryMessage(guarded: GuardedDecode, locale: SupportedLocale, summaryUrl: string): string {
  const topGotcha = [...guarded.gotchas].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  )[0];
  const delta = guarded.history?.vsPrevious?.totalDeltaMinor;
  const deltaLine =
    delta !== null && delta !== undefined && delta !== 0
      ? `${delta > 0 ? "📈" : "📉"} ${t(locale, "histDelta", { delta: formatDelta(delta, guarded.history!.currency, locale) })}`
      : null;
  const parts = [
    guarded.headline,
    deltaLine,
    topGotcha ? `⚠️ ${topGotcha.explanation}` : null,
    `🔗 ${t(locale, "fullBreakdown")}: ${summaryUrl}`,
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 1000);
}

function severityRank(s: "info" | "warn" | "alert"): number {
  return s === "alert" ? 2 : s === "warn" ? 1 : 0;
}

/** Message 2: the three follow-up buttons (WhatsApp max). */
export function buildFollowUpButtons(invoiceId: string, locale: SupportedLocale): { body: string; buttons: Button[] } {
  return {
    body: t(locale, "buttonsBody"),
    buttons: [
      { id: `explain:${invoiceId}`, title: t(locale, "explainMore") },
      { id: `savings:${invoiceId}`, title: t(locale, "showSavings") },
      { id: `act:${invoiceId}`, title: t(locale, "actOnThis") },
    ],
  };
}

export interface ProviderChatCta {
  channel: "whatsapp" | "sms" | "web_chat";
  providerName: string;
  /** href for buttons: wa.me / sms:…?&body=… / https chat page. */
  url: string;
  /** Human-readable endpoint for instruction copy (SMS short code etc.). */
  displayNumber?: string;
  /** Fixed keyword the SMS short code expects, when any. */
  smsKeyword?: string;
}

/** Normalize providerChat, accepting the legacy WhatsApp-only shape. */
function providerChatOf(guarded: GuardedDecode): NonNullable<GuardedDecode["providerChat"]> | null {
  if (guarded.providerChat) return guarded.providerChat;
  if (guarded.providerWa) return { ...guarded.providerWa, channel: "whatsapp" };
  return null;
}

/**
 * The provider's official support-chat channel as a ready-to-use CTA:
 * whatsapp/sms deep links carry a localized ask-for-a-better-deal message
 * pre-typed; web_chat is a plain link (widgets can't preload text). Null
 * when the curated directory has no source-confirmed channel.
 */
export function buildProviderChatCta(
  guarded: GuardedDecode,
  locale: SupportedLocale,
  opts?: { message?: string },
): ProviderChatCta | null {
  const chat = providerChatOf(guarded);
  if (!chat) return null;
  const providerName = chat.providerName;
  const message = opts?.message ?? t(locale, "providerWaDraft", { provider: providerName });
  if (chat.channel === "whatsapp" && chat.waNumber) {
    return { channel: "whatsapp", providerName, url: buildWaLink(chat.waNumber, message) };
  }
  if (chat.channel === "sms" && chat.smsNumber) {
    // A fixed keyword (what the short code expects) always beats free text.
    return {
      channel: "sms",
      providerName,
      url: buildSmsLink(chat.smsNumber, chat.smsBody ?? message),
      displayNumber: chat.smsNumber,
      ...(chat.smsBody ? { smsKeyword: chat.smsBody } : {}),
    };
  }
  if (chat.channel === "web_chat" && chat.chatUrl) {
    return { channel: "web_chat", providerName, url: chat.chatUrl };
  }
  return null;
}

/**
 * The "Act on this" flow when a guarded negotiation pitch exists: the
 * ready-to-send message in its own bubble (easy to copy/forward), the
 * channel CTA preloading that exact pitch, and the phone-call script.
 * Null when there's no pitch — callers fall back to DIY next steps.
 */
export function buildPitchMessages(guarded: GuardedDecode, locale: SupportedLocale): string[] | null {
  const pitch = guarded.pitch;
  if (!pitch) return null;
  const messages = [t(locale, "pitchIntro"), pitch.chatMessage];

  const cta = buildProviderChatCta(guarded, locale, { message: pitch.chatMessage });
  if (cta) {
    if (cta.channel === "whatsapp") {
      messages.push(`${t(locale, "providerWaCta", { provider: cta.providerName })}\n${cta.url}`);
    } else if (cta.channel === "sms") {
      messages.push(
        cta.smsKeyword
          ? t(locale, "providerSmsCtaKeyword", { provider: cta.providerName, keyword: cta.smsKeyword, number: cta.displayNumber! })
          : t(locale, "pitchSmsCta", { provider: cta.providerName, number: cta.displayNumber! }),
      );
    } else {
      messages.push(`${t(locale, "pitchWebChatHint", { provider: cta.providerName })}\n${cta.url}`);
    }
  }

  const s = pitch.callScript;
  const scriptLines = [
    `📞 ${t(locale, "pitchCall")}`,
    "",
    s.opening,
    `🗣 ${s.openAsk}`,
    s.onFirstOffer ? `▶️ ${t(locale, "pitchOnOffer")} ${s.onFirstOffer}` : "",
    ...s.pushHarder.map((p) => `↗ ${p}`),
    ...s.evidence.map((e) => `• ${e}`),
    ...s.objections.map((o) => `❓ "${o.ifTheySay}"\n→ ${o.youSay}`),
    s.closing,
  ].filter((line, i) => i < 2 || line.length > 0);
  messages.push(scriptLines.join("\n"));

  const goal =
    pitch.targetMonthlyMinor !== null
      ? t(locale, "pitchGoal", {
          amount: formatMoney({ amountMinor: pitch.targetMonthlyMinor, currency: pitch.currency }, locale),
        })
      : null;
  messages.push([goal, t(locale, "pitchTips")].filter(Boolean).join("\n\n"));

  return messages;
}

/** "Show savings" flow: one message per item, verified numbers only. */
export function buildSavingsMessages(guarded: GuardedDecode, locale: SupportedLocale): string[] {
  if (guarded.savings.length === 0) return [];
  const messages = [t(locale, "savingsIntro")];
  for (const saving of guarded.savings) {
    const amount =
      saving.amountMinor !== null
        ? `💰 ~${formatMoney({ amountMinor: saving.amountMinor, currency: saving.currency }, locale)} ${periodLabel(locale, saving.period)}`
        : `💡 ${t(locale, "noNumber")}`;
    const offerLine = saving.offer
      ? `🏷 ${saving.offer.provider} — ${saving.offer.name} (${formatMoney({ amountMinor: saving.offer.estMonthlyCostMinor, currency: saving.currency }, locale)}/${t(locale, "perMonth").replace(/^\W+/, "")})${saving.offer.link ? `\n${saving.offer.link}` : ""}`
      : null;
    messages.push([amount, saving.explanation, offerLine, `➡️ ${saving.nextStep}`].filter(Boolean).join("\n"));
  }
  const cta = buildProviderChatCta(guarded, locale);
  if (cta) {
    if (cta.channel === "whatsapp") {
      messages.push(`${t(locale, "providerWaCta", { provider: cta.providerName })}\n${cta.url}`);
    } else if (cta.channel === "sms") {
      // sms: URIs aren't tappable inside WhatsApp — send instructions instead.
      messages.push(
        cta.smsKeyword
          ? t(locale, "providerSmsCtaKeyword", { provider: cta.providerName, keyword: cta.smsKeyword, number: cta.displayNumber! })
          : t(locale, "providerSmsCta", { provider: cta.providerName, number: cta.displayNumber! }),
      );
    } else {
      messages.push(`${t(locale, "providerChatCta", { provider: cta.providerName })}\n${cta.url}`);
    }
  }
  return messages;
}

/** "Explain more" drains one queued section per tap. */
export function nextExplainMore(guarded: GuardedDecode, alreadySent: number, locale: SupportedLocale): string {
  return guarded.explainMoreQueue[alreadySent] ?? t(locale, "noMoreDetail");
}
