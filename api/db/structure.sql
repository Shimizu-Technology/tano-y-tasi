SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_invitations (
    id bigint NOT NULL,
    email character varying NOT NULL,
    clerk_invitation_id character varying,
    accepted_at timestamp(6) without time zone,
    revoked_at timestamp(6) without time zone,
    invited_by_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT invitation_email_normalized CHECK (((email)::text = lower(btrim((email)::text))))
);


--
-- Name: admin_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_invitations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_invitations_id_seq OWNED BY public.admin_invitations.id;


--
-- Name: ar_internal_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_internal_metadata (
    key character varying NOT NULL,
    value character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: drops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drops (
    id bigint NOT NULL,
    slug character varying NOT NULL,
    number integer NOT NULL,
    name character varying NOT NULL,
    release_at timestamp(6) without time zone,
    closes_at timestamp(6) without time zone,
    sold_out_at timestamp(6) without time zone,
    quantity integer NOT NULL,
    per_customer_limit integer DEFAULT 2 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT drop_quantities_valid CHECK (((quantity >= 0) AND (per_customer_limit > 0)))
);


--
-- Name: drops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drops_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drops_id_seq OWNED BY public.drops.id;


--
-- Name: email_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_deliveries (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    kind character varying NOT NULL,
    "to" character varying NOT NULL,
    subject character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    resend_number integer DEFAULT 0 NOT NULL,
    outbound_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_error text,
    provider_message_id character varying,
    sent_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT email_delivery_valid CHECK ((((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])) AND (attempts >= 0)))
);


--
-- Name: email_deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_deliveries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_deliveries_id_seq OWNED BY public.email_deliveries.id;


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id bigint NOT NULL,
    product_id bigint NOT NULL,
    order_id bigint,
    delta integer NOT NULL,
    balance integer NOT NULL,
    reason character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    note text,
    production_run_id bigint,
    CONSTRAINT inventory_movement_valid CHECK (((balance >= 0) AND (delta <> 0)))
);


--
-- Name: inventory_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_movements_id_seq OWNED BY public.inventory_movements.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    product_id bigint NOT NULL,
    product_slug character varying NOT NULL,
    name character varying NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    image jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    preorder_ships character varying,
    CONSTRAINT item_amounts_valid CHECK (((quantity > 0) AND (unit_price_cents >= 0)))
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: order_numbers; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_numbers
    START WITH 100001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    token character varying NOT NULL,
    number character varying DEFAULT ('TYT-'::text || (nextval('public.order_numbers'::regclass))::text) NOT NULL,
    email character varying NOT NULL,
    status character varying DEFAULT 'pending_payment'::character varying NOT NULL,
    subtotal_cents integer NOT NULL,
    total_cents integer NOT NULL,
    currency character varying DEFAULT 'USD'::character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    request_fingerprint character varying NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    paid_at timestamp(6) without time zone,
    provider character varying NOT NULL,
    provider_session_id character varying,
    provider_payment_intent_id character varying,
    payment_url text,
    shipping jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    provider_session_expires_at timestamp(6) without time zone,
    provider_session_closed_at timestamp(6) without time zone,
    fulfillment_status character varying DEFAULT 'unfulfilled'::character varying NOT NULL,
    tracking_number character varying,
    tracking_url character varying,
    fulfilled_at timestamp(6) without time zone,
    notes text,
    attention_reason character varying,
    charged_cents integer,
    refunded_cents integer DEFAULT 0 NOT NULL,
    refunded_at timestamp(6) without time zone,
    dispute_status character varying,
    failed_refund_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    customer_key character varying NOT NULL,
    shipping_cents integer DEFAULT 0 NOT NULL,
    tax_cents integer DEFAULT 0 NOT NULL,
    shipping_method jsonb,
    fulfillment_method character varying DEFAULT 'ship'::character varying NOT NULL,
    label_shipment_id character varying,
    label_status character varying,
    label_url text,
    label_cost_cents integer,
    label_bought_at timestamp(6) without time zone,
    tracking_status character varying,
    tracking_status_at timestamp(6) without time zone,
    CONSTRAINT fulfillment_status_valid CHECK (((fulfillment_status)::text = ANY ((ARRAY['unfulfilled'::character varying, 'fulfilled'::character varying])::text[]))),
    CONSTRAINT order_email_normalized CHECK (((email)::text = lower(btrim((email)::text)))),
    CONSTRAINT order_refund_valid CHECK (((refunded_cents >= 0) AND ((charged_cents IS NULL) OR (charged_cents >= 0)))),
    CONSTRAINT order_shipping_valid CHECK (((shipping_cents >= 0) AND (tax_cents >= 0) AND ((fulfillment_method)::text = ANY ((ARRAY['ship'::character varying, 'pickup'::character varying])::text[])))),
    CONSTRAINT order_status_valid CHECK (((status)::text = ANY (ARRAY[('pending_payment'::character varying)::text, ('paid'::character varying)::text, ('expired'::character varying)::text, ('canceled'::character varying)::text, ('refunded'::character varying)::text, ('needs_attention'::character varying)::text]))),
    CONSTRAINT order_totals_valid CHECK (((subtotal_cents >= 0) AND (total_cents >= 0) AND ((currency)::text = 'USD'::text)))
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pages (
    id bigint NOT NULL,
    slug character varying NOT NULL,
    title character varying NOT NULL,
    body text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: pages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pages_id_seq OWNED BY public.pages.id;


--
-- Name: payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_events (
    id bigint NOT NULL,
    provider character varying NOT NULL,
    event_id character varying NOT NULL,
    event_type character varying NOT NULL,
    processed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    payment_intent_id character varying
);


--
-- Name: payment_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_events_id_seq OWNED BY public.payment_events.id;


--
-- Name: production_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_runs (
    id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity integer NOT NULL,
    status character varying DEFAULT 'ordered'::character varying NOT NULL,
    supplier character varying,
    unit_cost_cents integer,
    expected_at date,
    received_at timestamp(6) without time zone,
    stock_added integer,
    notes text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT production_run_valid CHECK (((quantity > 0) AND ((status)::text = ANY ((ARRAY['ordered'::character varying, 'received'::character varying, 'canceled'::character varying])::text[])) AND ((unit_cost_cents IS NULL) OR (unit_cost_cents >= 0)) AND ((stock_added IS NULL) OR (stock_added >= 0)) AND (((status)::text = 'received'::text) = (received_at IS NOT NULL)) AND (((status)::text = 'received'::text) = (stock_added IS NOT NULL))))
);


--
-- Name: production_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.production_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: production_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.production_runs_id_seq OWNED BY public.production_runs.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    drop_id bigint,
    slug character varying NOT NULL,
    name character varying NOT NULL,
    kind character varying DEFAULT 'core'::character varying NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    price_cents integer NOT NULL,
    currency character varying DEFAULT 'USD'::character varying NOT NULL,
    summary text NOT NULL,
    description text NOT NULL,
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    includes jsonb DEFAULT '[]'::jsonb NOT NULL,
    art jsonb DEFAULT '{}'::jsonb NOT NULL,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    placeholders jsonb DEFAULT '[]'::jsonb NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    signature boolean DEFAULT false NOT NULL,
    per_customer_limit integer,
    preorder boolean DEFAULT false NOT NULL,
    preorder_ships character varying,
    weight_oz numeric(8,2),
    length_in numeric(6,2),
    width_in numeric(6,2),
    height_in numeric(6,2),
    CONSTRAINT preorder_says_when_it_ships CHECK (((NOT preorder) OR (COALESCE(btrim((preorder_ships)::text), ''::text) <> ''::text))),
    CONSTRAINT product_drop_consistent CHECK (((((kind)::text = 'drop'::text) AND (drop_id IS NOT NULL)) OR (((kind)::text = 'core'::text) AND (drop_id IS NULL)))),
    CONSTRAINT product_limit_valid CHECK (((per_customer_limit IS NULL) OR (per_customer_limit > 0))),
    CONSTRAINT product_parcel_valid CHECK ((((weight_oz IS NULL) OR (weight_oz > (0)::numeric)) AND ((length_in IS NULL) OR (length_in > (0)::numeric)) AND ((width_in IS NULL) OR (width_in > (0)::numeric)) AND ((height_in IS NULL) OR (height_in > (0)::numeric)))),
    CONSTRAINT product_price_valid CHECK (((price_cents >= 0) AND ((currency)::text = 'USD'::text))),
    CONSTRAINT product_states_valid CHECK ((((kind)::text = ANY (ARRAY[('core'::character varying)::text, ('drop'::character varying)::text])) AND ((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('active'::character varying)::text, ('archived'::character varying)::text])))),
    CONSTRAINT stock_nonnegative CHECK ((stock_quantity >= 0))
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: provider_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_leases (
    key character varying NOT NULL,
    holder character varying NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL
);


--
-- Name: refund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refund_requests (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    amount_cents integer NOT NULL,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    provider_refund_id character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT refund_request_valid CHECK (((amount_cents > 0) AND ((status)::text = ANY ((ARRAY['open'::character varying, 'completed'::character varying, 'rejected'::character varying])::text[]))))
);


--
-- Name: refund_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refund_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refund_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refund_requests_id_seq OWNED BY public.refund_requests.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: shipping_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_events (
    id bigint NOT NULL,
    order_id bigint,
    event_id character varying NOT NULL,
    event_type character varying NOT NULL,
    shipment_id character varying,
    tracking_code character varying,
    status character varying,
    occurred_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: shipping_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shipping_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipping_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shipping_events_id_seq OWNED BY public.shipping_events.id;


--
-- Name: store_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_settings (
    id bigint NOT NULL,
    sales_open boolean DEFAULT false NOT NULL,
    contact_email character varying DEFAULT 'shimizutechnology@gmail.com'::character varying NOT NULL,
    tagline character varying DEFAULT 'A piece of home.'::character varying NOT NULL,
    secondary_tagline character varying DEFAULT 'Grounded by land, guided by sea.'::character varying NOT NULL,
    story text DEFAULT 'Land and sea define our islands, but our culture extends beyond their shores. Tåno y Tåsi exists to keep us connected to where we come from, carrying a piece of home wherever we are.'::text NOT NULL,
    mission_lines jsonb DEFAULT '["A piece of home.", "Keeping us connected to where we come from.", "Carrying a piece of home wherever we are."]'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    tax_enabled boolean DEFAULT false NOT NULL,
    shipping_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    flat_rates_saved_at timestamp(6) without time zone
);


--
-- Name: store_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_settings_id_seq OWNED BY public.store_settings.id;


--
-- Name: subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscribers (
    id bigint NOT NULL,
    email character varying NOT NULL,
    source character varying,
    drop_slug character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: subscribers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscribers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscribers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscribers_id_seq OWNED BY public.subscribers.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    clerk_id character varying NOT NULL,
    email character varying NOT NULL,
    name character varying,
    role character varying DEFAULT 'admin'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_signed_in_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT admin_identity_valid CHECK ((((role)::text = 'admin'::text) AND ((email)::text = lower(btrim((email)::text)))))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: admin_invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_invitations ALTER COLUMN id SET DEFAULT nextval('public.admin_invitations_id_seq'::regclass);


--
-- Name: drops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drops ALTER COLUMN id SET DEFAULT nextval('public.drops_id_seq'::regclass);


--
-- Name: email_deliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries ALTER COLUMN id SET DEFAULT nextval('public.email_deliveries_id_seq'::regclass);


--
-- Name: inventory_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements ALTER COLUMN id SET DEFAULT nextval('public.inventory_movements_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: pages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages ALTER COLUMN id SET DEFAULT nextval('public.pages_id_seq'::regclass);


--
-- Name: payment_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events ALTER COLUMN id SET DEFAULT nextval('public.payment_events_id_seq'::regclass);


--
-- Name: production_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_runs ALTER COLUMN id SET DEFAULT nextval('public.production_runs_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: refund_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests ALTER COLUMN id SET DEFAULT nextval('public.refund_requests_id_seq'::regclass);


--
-- Name: shipping_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_events ALTER COLUMN id SET DEFAULT nextval('public.shipping_events_id_seq'::regclass);


--
-- Name: store_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_settings ALTER COLUMN id SET DEFAULT nextval('public.store_settings_id_seq'::regclass);


--
-- Name: subscribers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers ALTER COLUMN id SET DEFAULT nextval('public.subscribers_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: admin_invitations admin_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_invitations
    ADD CONSTRAINT admin_invitations_pkey PRIMARY KEY (id);


--
-- Name: ar_internal_metadata ar_internal_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_internal_metadata
    ADD CONSTRAINT ar_internal_metadata_pkey PRIMARY KEY (key);


--
-- Name: drops drops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drops
    ADD CONSTRAINT drops_pkey PRIMARY KEY (id);


--
-- Name: email_deliveries email_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT email_deliveries_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: production_runs production_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_runs
    ADD CONSTRAINT production_runs_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: provider_leases provider_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_leases
    ADD CONSTRAINT provider_leases_pkey PRIMARY KEY (key);


--
-- Name: refund_requests refund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: shipping_events shipping_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_events
    ADD CONSTRAINT shipping_events_pkey PRIMARY KEY (id);


--
-- Name: store_settings store_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_settings
    ADD CONSTRAINT store_settings_pkey PRIMARY KEY (id);


--
-- Name: subscribers subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: index_admin_invitations_on_invited_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_admin_invitations_on_invited_by_id ON public.admin_invitations USING btree (invited_by_id);


--
-- Name: index_drops_on_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_drops_on_number ON public.drops USING btree (number);


--
-- Name: index_drops_on_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_drops_on_slug ON public.drops USING btree (slug);


--
-- Name: index_email_deliveries_on_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_email_deliveries_on_order_id ON public.email_deliveries USING btree (order_id);


--
-- Name: index_email_deliveries_on_order_id_and_kind_and_to; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_email_deliveries_on_order_id_and_kind_and_to ON public.email_deliveries USING btree (order_id, kind, "to");


--
-- Name: index_inventory_movements_on_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_inventory_movements_on_order_id ON public.inventory_movements USING btree (order_id);


--
-- Name: index_inventory_movements_on_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_inventory_movements_on_product_id ON public.inventory_movements USING btree (product_id);


--
-- Name: index_order_items_on_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_order_items_on_order_id ON public.order_items USING btree (order_id);


--
-- Name: index_order_items_on_order_id_and_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_order_items_on_order_id_and_product_id ON public.order_items USING btree (order_id, product_id);


--
-- Name: index_order_items_on_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_order_items_on_product_id ON public.order_items USING btree (product_id);


--
-- Name: index_orders_on_customer_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_orders_on_customer_key ON public.orders USING btree (customer_key);


--
-- Name: index_orders_on_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_orders_on_email ON public.orders USING btree (email);


--
-- Name: index_orders_on_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_orders_on_idempotency_key ON public.orders USING btree (idempotency_key);


--
-- Name: index_orders_on_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_orders_on_number ON public.orders USING btree (number);


--
-- Name: index_orders_on_provider_payment_intent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_orders_on_provider_payment_intent_id ON public.orders USING btree (provider_payment_intent_id) WHERE (provider_payment_intent_id IS NOT NULL);


--
-- Name: index_orders_on_provider_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_orders_on_provider_session_id ON public.orders USING btree (provider_session_id) WHERE (provider_session_id IS NOT NULL);


--
-- Name: index_orders_on_status_and_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_orders_on_status_and_expires_at ON public.orders USING btree (status, expires_at);


--
-- Name: index_orders_on_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_orders_on_token ON public.orders USING btree (token);


--
-- Name: index_pages_on_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_pages_on_slug ON public.pages USING btree (slug);


--
-- Name: index_payment_events_on_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_payment_events_on_event_id ON public.payment_events USING btree (event_id);


--
-- Name: index_production_runs_on_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_production_runs_on_product_id ON public.production_runs USING btree (product_id);


--
-- Name: index_products_on_drop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_products_on_drop_id ON public.products USING btree (drop_id);


--
-- Name: index_products_on_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_products_on_slug ON public.products USING btree (slug);


--
-- Name: index_refund_requests_on_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_refund_requests_on_idempotency_key ON public.refund_requests USING btree (idempotency_key);


--
-- Name: index_refund_requests_on_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_refund_requests_on_order_id ON public.refund_requests USING btree (order_id);


--
-- Name: index_shipping_events_on_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_shipping_events_on_event_id ON public.shipping_events USING btree (event_id);


--
-- Name: index_shipping_events_on_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_shipping_events_on_order_id ON public.shipping_events USING btree (order_id);


--
-- Name: index_users_on_clerk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_users_on_clerk_id ON public.users USING btree (clerk_id);


--
-- Name: one_movement_per_production_run; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_movement_per_production_run ON public.inventory_movements USING btree (production_run_id) WHERE (production_run_id IS NOT NULL);


--
-- Name: one_open_refund_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_open_refund_request ON public.refund_requests USING btree (order_id) WHERE ((status)::text = 'open'::text);


--
-- Name: one_order_per_label_shipment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_order_per_label_shipment ON public.orders USING btree (label_shipment_id) WHERE (label_shipment_id IS NOT NULL);


--
-- Name: one_pending_admin_invitation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_pending_admin_invitation ON public.admin_invitations USING btree (email) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: one_store_settings_row; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_store_settings_row ON public.store_settings USING btree ((true));


--
-- Name: orders_unclosed_sessions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_unclosed_sessions ON public.orders USING btree (updated_at) WHERE (((provider)::text = 'stripe'::text) AND ((status)::text = ANY ((ARRAY['canceled'::character varying, 'expired'::character varying])::text[])) AND (provider_session_id IS NOT NULL) AND (provider_session_closed_at IS NULL));


--
-- Name: subscribers_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscribers_email_unique ON public.subscribers USING btree (lower((email)::text));


--
-- Name: unresolved_payment_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unresolved_payment_events ON public.payment_events USING btree (payment_intent_id) WHERE (processed_at IS NULL);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (lower((email)::text));


--
-- Name: admin_invitations fk_rails_49ad58b754; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_invitations
    ADD CONSTRAINT fk_rails_49ad58b754 FOREIGN KEY (invited_by_id) REFERENCES public.users(id);


--
-- Name: inventory_movements fk_rails_665a2ba6d3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_rails_665a2ba6d3 FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: production_runs fk_rails_6a13b4e701; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_runs
    ADD CONSTRAINT fk_rails_6a13b4e701 FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: shipping_events fk_rails_73287bcb61; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_events
    ADD CONSTRAINT fk_rails_73287bcb61 FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: products fk_rails_87af88941b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_rails_87af88941b FOREIGN KEY (drop_id) REFERENCES public.drops(id);


--
-- Name: refund_requests fk_rails_8b4634219e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT fk_rails_8b4634219e FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: email_deliveries fk_rails_8e555e3c0e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT fk_rails_8e555e3c0e FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: inventory_movements fk_rails_a194b8f569; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_rails_a194b8f569 FOREIGN KEY (production_run_id) REFERENCES public.production_runs(id);


--
-- Name: inventory_movements fk_rails_a50a98f058; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_rails_a50a98f058 FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items fk_rails_e3cb28f071; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_rails_e3cb28f071 FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items fk_rails_f1a29ddd47; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_rails_f1a29ddd47 FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- PostgreSQL database dump complete
--

SET search_path TO "$user", public;

INSERT INTO "schema_migrations" (version) VALUES
('20261104000005'),
('20261104000004'),
('20261104000003'),
('20261104000002'),
('20261104000001'),
('20261029000005'),
('20261029000004'),
('20261029000003'),
('20261029000002'),
('20261029000001');

