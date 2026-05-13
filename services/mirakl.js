import axios from 'axios';

export const getMiraklOrders = async () => {
    // 7 days ago at the start of the day
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const sevenDaysAgo = date.toISOString();

    try {
        const response = await axios.get(`${process.env.MIRAKL_BASE_URL}/api/orders`, {
            headers: { 
                'Authorization': process.env.MIRAKL_API_KEY,
                'Accept': 'application/json'
            },
            params: { 
                // 1. Try every variant of "limit" used by different Mirakl versions
                max_results: 100,
                limit: 100,
                max: 100,
                
                // 2. Try both common date filters
                start_date: sevenDaysAgo,
                date_from: sevenDaysAgo,

                // 3. Statuses: Ensure we catch everything across all regions
                // Note: Some instances prefer comma-separated, some want multiple params.
                // We'll stick to comma-separated first.
                order_state_codes: 'STAGING,WAITING_ACCEPTANCE,WAITING_DEBIT,WAITING_DEBIT_PAYMENT,SHIPPING,SHIPPED,RECEIVED,CLOSED,CANCELED',
            }
        });

        const orders = response.data.orders || [];

        // --- DEBUGGING LOGS ---
        console.log(`Total orders found in this batch: ${orders.length}`);
        if (response.data.total_count) {
            console.log(`Total orders available on server: ${response.data.total_count}`);
        }
        // -----------------------

        const dailySummary = orders.reduce((acc, order) => {
            const dateKey = new Date(order.created_date).toISOString().split('T')[0];
            const amount = parseFloat(order.total_price) || 0;
            
            if (!acc[dateKey]) {
                acc[dateKey] = { date: dateKey, total: 0, count: 0 };
            }
            acc[dateKey].total += amount;
            acc[dateKey].count += 1;
            return acc;
        }, {});

        return {
            orderCount: orders.length,
            totalValue: orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0),
            dailySummary: Object.values(dailySummary).sort((a, b) => b.date.localeCompare(a.date)),
            orders: orders.map(o => ({
                id: o.order_id,
                shop: o.shop_name || o.shop_id, // Help identify BE/NL/DE
                status: o.order_state,
                date: new Date(o.created_date).toLocaleDateString('nl-NL'),
                value: parseFloat(o.total_price) || 0,
            })),
        };
    } catch (error) {
        console.error("Mirakl Error:", error.response?.data || error.message);
        return { orderCount: 0, totalValue: 0, dailySummary: [], error: true };
    }
};

export default { getMiraklOrders };