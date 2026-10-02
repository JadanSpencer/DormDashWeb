// app/legal/terms.tsx  (URL: /legal/terms)
// DormDash Terms of Service. Facts such as the payment method and contact
// email live in constants/legal.ts. Have these reviewed by a lawyer in
// Jamaica before a wide launch.

import { LegalDocument, Section } from '../../components/LegalDocument';
import { LEGAL } from '../../constants/legal';
import { MIN_DELIVERY_FEE_JMD, deliveryFeeForDistance, splitDeliveryFee, formatJMD } from '../../constants';

// Figures quoted in the Terms, from the live pricing rules (functions/src/shared.ts).
const FEE_EXAMPLE = deliveryFeeForDistance(1000);   // a longer walk
const MIN_SPLIT = splitDeliveryFee(MIN_DELIVERY_FEE_JMD);
const EXAMPLE_SPLIT = splitDeliveryFee(FEE_EXAMPLE);

const sections: Section[] = [
  {
    title: 'What Runner is',
    blocks: [
      { p: `${LEGAL.appName} connects students who want food and essentials from campus stores with other students ("runners") who pick up and deliver those orders. ${LEGAL.appName} is operated by ${LEGAL.operator}, ${LEGAL.country}.` },
      { p: `${LEGAL.appName} is not a store and does not prepare food. Stores set their own menus, prices and opening hours, and are responsible for the food they sell.` },
    ],
  },
  {
    title: 'Who can use it',
    blocks: [{ list: [
      `You must be at least ${LEGAL.minimumAge} and a student or staff member of a university Runner serves.`,
      'You must give accurate account details and keep them up to date.',
      'One account per person. You are responsible for everything done with your account, so keep your password private.',
    ] }],
  },
  {
    title: 'Ordering',
    blocks: [{ list: [
      `Prices and availability shown in the app come from the stores and can change. The delivery fee depends on how far your delivery location is from the store: it starts at ${formatJMD(MIN_DELIVERY_FEE_JMD)} for the closest places and rises with the walking distance (for example ${formatJMD(FEE_EXAMPLE)} for about 1 km). You choose your location from our list of halls, faculties and other places, and the exact fee is shown before you place the order. Our servers check every order against the current menu. If something is wrong or unavailable, your order may be corrected or cancelled, and the app will tell you.`,
      'You can cancel an order until a runner accepts it. After that, contact your runner or us.',
      'Give a delivery address your runner can actually find, and be reachable when your order arrives.',
      'Allergen information comes from the stores. If you have a serious allergy, check with the store before ordering.',
    ] }],
  },
  {
    title: 'Payment',
    blocks: [
      { p: LEGAL.paymentMethod },
      { p: `${LEGAL.appName} never sees or stores your card number. Fygaro may add a card processing fee, which is shown on its payment page before you pay.` },
      { list: [
        `Runner tokens are prepaid credit for ${LEGAL.appName} orders. 1 token = J$${LEGAL.tokenValueJmd}. You can buy them by card in the app, or pay cash to a ${LEGAL.appName} admin, who adds them to your account.`,
        'Tokens can only be used on Runner. They have no cash value and cannot be exchanged for cash, except where the law requires it.',
        'If a paid order is cancelled, or your card payment arrives after the order was cancelled, the amount is returned to you as tokens.',
        `If you think a charge or token balance is wrong, email ${LEGAL.contactEmail} with the details and we will look into it.`,
      ] },
    ],
  },
  {
    title: 'Runners',
    blocks: [{ list: [
      'Runners are independent students using the platform. They are not employees or agents of Runner.',
      `For each order delivered, the runner earns most of the delivery fee and Runner keeps a smaller part to run the service. The split depends on the fee: for example, on a ${formatJMD(MIN_DELIVERY_FEE_JMD)} fee the runner earns ${formatJMD(MIN_SPLIT.dasherPayoutJmd)} and Runner keeps ${formatJMD(MIN_SPLIT.platformFeeJmd)}; on ${formatJMD(FEE_EXAMPLE)} the runner earns ${formatJMD(EXAMPLE_SPLIT.dasherPayoutJmd)} and Runner keeps ${formatJMD(EXAMPLE_SPLIT.platformFeeJmd)}. The runner sees their payout on each order before accepting it.`,
      'When you accept an order, deliver it promptly, handle food with care, and do not open, swap or tamper with it.',
      'Go offline when you stop taking orders, so students are not left waiting.',
      'Follow campus rules and the law while delivering, including road safety rules.',
    ] }],
  },
  {
    title: 'What you must not do',
    blocks: [{ list: [
      'Place fake orders, or orders you do not intend to pay for.',
      'Try to change prices, balances or payments, or reuse a payment confirmation.',
      'Change prices, tamper with the app, or try to get around our security or rate limits.',
      'Access other people\'s accounts or data, or collect data from the app with bots or scripts.',
      'Harass, threaten or discriminate against runners, students or store staff.',
      'Use Runner to deliver anything illegal.',
    ] }],
  },
  {
    title: 'Suspension and ending your account',
    blocks: [
      { p: 'We can deactivate an account that breaks these terms, puts others at risk, or is used for fraud. Where it is safe to do so, we will tell you why.' },
      { p: 'You can deactivate or delete your account at any time from Profile. Deleting it is permanent. The /legal/privacy explains exactly what is deleted and what is kept.' },
    ],
  },
  {
    title: 'The service',
    blocks: [
      { p: `We work to keep ${LEGAL.appName} available and accurate, but we cannot promise it will always be available, error-free, or that a runner will always be free to take your order. We may change or stop features, including while the app is in early release.` },
    ],
  },
  {
    title: 'Responsibility',
    blocks: [
      { p: 'Nothing in these terms limits rights you have under Jamaican consumer protection law that cannot legally be limited.' },
      { p: `To the extent the law allows, ${LEGAL.operator} is not responsible for the quality or safety of food prepared by stores, for losses caused by events outside our control, or for indirect losses. Where we are responsible, our liability for any order is limited to the amount paid for that order.` },
    ],
  },
  {
    title: 'Problems and disputes',
    blocks: [
      { p: `If something goes wrong with an order, email ${LEGAL.contactEmail} with the order details and we will try to resolve it. These terms are governed by the laws of Jamaica, and the courts of Jamaica handle any dispute we cannot resolve together.` },
    ],
  },
  {
    title: 'Changes',
    blocks: [
      { p: 'If we change these terms in a way that matters, we will tell you in the app before the change applies. Continuing to use Runner after that means you accept the new terms.' },
    ],
  },
];

export default function TermsOfService() {
  return (
    <LegalDocument
      title="Terms of Service"
      updated={LEGAL.termsUpdated}
      intro={`These terms are the agreement between you and ${LEGAL.operator} for using ${LEGAL.appName}. By creating an account or using the app, you agree to them. Please also read our /legal/privacy.`}
      sections={sections}
    />
  );
}
