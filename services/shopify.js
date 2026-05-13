import axios from 'axios';

const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2024-01/graphql.json`;

export const getShopifyOrders = async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const graphqlQuery = `{
        orders(first: 250, query: "created_at:>=${sevenDaysAgo}") {
          edges {
            node {
              name
              createdAt
              totalPriceSet { shopMoney { amount } }
            }
          }
        }
    }`;

    try {
        const response = await axios.post(SHOPIFY_API_URL, { query: graphqlQuery }, {
            headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN, 'Content-Type': 'application/json' }
        });

        const orders = response.data.data.orders.edges.map(edge => edge.node);
        
        // Grouping logic for Daily Summary
        const dailySummary = orders.reduce((acc, order) => {
            const date = new Date(order.createdAt).toISOString().split('T')[0];
            const amount = parseFloat(order.totalPriceSet.shopMoney.amount);
            
            if (!acc[date]) {
                acc[date] = { date, total: 0, count: 0 };
            }
            acc[date].total += amount;
            acc[date].count += 1;
            return acc;
        }, {});

        return {
            orderCount: orders.length,
            totalValue: orders.reduce((sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount), 0),
            dailySummary: Object.values(dailySummary).sort((a, b) => b.date.localeCompare(a.date)), // Newest first
            orders: orders.map(o => ({
                number: o.name,
                date: new Date(o.createdAt).toLocaleDateString('nl-NL'),
                value: parseFloat(o.totalPriceSet.shopMoney.amount),
            })),
        };
    } catch (error) {
        console.error('Shopify Error:', error.message);
        return { orderCount: 0, totalValue: 0, dailySummary: [] };
    }
};

export default {
    getShopifyOrders,
};
