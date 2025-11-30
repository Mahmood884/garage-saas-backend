class ChatbotService {
  constructor() {
    this.responses = {
      greeting: {
        ar: 'مرحباً! أنا مساعد الورشة الذكي. كيف أقدر أساعدك اليوم؟',
        en: 'Hello! I am the smart garage assistant. How can I help you today?'
      },
      status: {
        ar: 'أستطيع تحديثك بحالة سيارتك. اكتب رقم السيارة أو رقم هاتفك المسجل.',
        en: 'I can update you on your car status. Please provide your car number or registered phone.'
      },
      time: {
        ar: 'وقت الإصلاح يعتمد على نوع العمل. التشخيص الأولي عادةً من 1 إلى 2 ساعة.',
        en: 'Repair time depends on the type of job. Initial diagnosis is usually 1–2 hours.'
      },
      cost: {
        ar: 'التكلفة يتم تحديدها بعد التشخيص. أسعارنا تنافسية وشفافة.',
        en: 'Cost is determined after diagnosis. Our prices are competitive and transparent.'
      },
      help: {
        ar: 'اكتب: حالة | وقت | تكلفة | شكوى | مدير للحصول على خيارات أكثر.',
        en: 'Type: status | time | cost | complaint | manager for more options.'
      },
      default: {
        ar: 'لم أفهم سؤالك بالضبط. حاول تعيد صياغته أو اكتب "مساعدة".',
        en: 'I did not fully understand. Please rephrase or type "help".'
      }
    };

    this.escalationKeywords = [
      'شكوى', 'مشكلة', 'مستعجل', 'مدير',
      'complaint', 'problem', 'urgent', 'manager'
    ];
  }

  analyzeMessage(text) {
    if (!text) return { type: 'general', message: this.responses.default.ar, needsHuman: false };

    const msg = text.toLowerCase();

    if (msg.includes('مرحبا') || msg.includes('اهلا') || msg.includes('hello')) {
      return { type: 'greeting', message: this.responses.greeting.ar, needsHuman: false };
    }

    if (msg.includes('حالة') || msg.includes('status')) {
      return { type: 'status', message: this.responses.status.ar, needsHuman: false };
    }

    if (msg.includes('وقت') || msg.includes('متى') || msg.includes('time')) {
      return { type: 'time', message: this.responses.time.ar, needsHuman: false };
    }

    if (msg.includes('سعر') || msg.includes('تكلفة') || msg.includes('cost') || msg.includes('price')) {
      return { type: 'cost', message: this.responses.cost.ar, needsHuman: false };
    }

    if (msg.includes('مساعدة') || msg.includes('help')) {
      return { type: 'help', message: this.responses.help.ar, needsHuman: false };
    }

    const needsEscalation = this.escalationKeywords.some((kw) => msg.includes(kw));
    if (needsEscalation) {
      return {
        type: 'escalation',
        message: 'سأقوم بتحويل استفسارك لمسؤول الورشة لأن طلبك مهم.',
        needsHuman: true
      };
    }

    return { type: 'general', message: this.responses.default.ar, needsHuman: false };
  }

  async handleCustomerQuery(message, customerPhone, carInfo = null) {
    const base = this.analyzeMessage(message);

    if (base.type === 'status' && carInfo) {
      const extra =
        `\n\nحالة سيارتك الحالية:\n` +
        `الحالة: ${carInfo.status}\n` +
        `المرحلة: ${carInfo.current_phase || 'غير محددة'}\n` +
        `آخر تحديث: ${carInfo.updated_at || carInfo.created_at}`;
      return { ...base, message: base.message + extra };
    }

    return base;
  }
}

module.exports = ChatbotService;
