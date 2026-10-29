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
    release_at timestamp(6) without time zone NOT NULL,
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
    CONSTRAINT fulfillment_status_valid CHECK (((fulfillment_status)::text = ANY ((ARRAY['unfulfilled'::character varying, 'fulfilled'::character varying])::text[]))),
    CONSTRAINT order_email_normalized CHECK (((email)::text = lower(btrim((email)::text)))),
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
-- Name: payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_events (
    id bigint NOT NULL,
    provider character varying NOT NULL,
    event_id character varying NOT NULL,
    event_type character varying NOT NULL,
    processed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
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
    CONSTRAINT product_drop_consistent CHECK (((((kind)::text = 'drop'::text) AND (drop_id IS NOT NULL)) OR (((kind)::text = 'core'::text) AND (drop_id IS NULL)))),
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
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


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
-- Name: payment_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events ALTER COLUMN id SET DEFAULT nextval('public.payment_events_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


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
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


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
-- Name: index_payment_events_on_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_payment_events_on_event_id ON public.payment_events USING btree (event_id);


--
-- Name: index_products_on_drop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_products_on_drop_id ON public.products USING btree (drop_id);


--
-- Name: index_products_on_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_products_on_slug ON public.products USING btree (slug);


--
-- Name: index_users_on_clerk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_users_on_clerk_id ON public.users USING btree (clerk_id);


--
-- Name: one_pending_admin_invitation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_pending_admin_invitation ON public.admin_invitations USING btree (email) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: one_product_per_drop; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_product_per_drop ON public.products USING btree (drop_id) WHERE (drop_id IS NOT NULL);


--
-- Name: orders_unclosed_sessions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_unclosed_sessions ON public.orders USING btree (updated_at) WHERE (((provider)::text = 'stripe'::text) AND ((status)::text = ANY ((ARRAY['canceled'::character varying, 'expired'::character varying])::text[])) AND (provider_session_id IS NOT NULL) AND (provider_session_closed_at IS NULL));


--
-- Name: subscribers_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscribers_email_unique ON public.subscribers USING btree (lower((email)::text));


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
-- Name: products fk_rails_87af88941b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_rails_87af88941b FOREIGN KEY (drop_id) REFERENCES public.drops(id);


--
-- Name: email_deliveries fk_rails_8e555e3c0e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT fk_rails_8e555e3c0e FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


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
('20261029000004'),
('20261029000003'),
('20261029000002'),
('20261029000001');

