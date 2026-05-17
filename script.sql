CREATE TABLE IF NOT EXISTS payroll_extras (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id),
    quote_id INT REFERENCES quotes(id),
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    payment_date DATE DEFAULT CURRENT_DATE,
    payroll_id INT
);