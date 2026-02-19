/* eslint-disable no-console */

const proPriceId = process.env.STRIPE_PRO_PRICE_ID ?? 'price_pro_placeholder';
const teamPriceId = process.env.STRIPE_TEAM_PRICE_ID ?? 'price_team_placeholder';

console.log('Stripe setup (dry run)');
console.log('Would create product: Mission Control Pro ($29/month flat)');
console.log('Would create product: Mission Control Team ($19/seat/month, min 10 seats)');
console.log(`Pro price ID: ${proPriceId}`);
console.log(`Team price ID: ${teamPriceId}`);
