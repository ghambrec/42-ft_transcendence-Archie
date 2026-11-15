COMPOSE := docker compose -f ./docker-compose.yml
COMPOSE_DEV := ${COMPOSE} -f ./docker-compose.dev.yml
# all services of prod and dev, used for cleanup
COMPOSE_ALL := ${COMPOSE_DEV} --profile monitoring
COMPOSE_TEST := docker compose -p documents-system-test -f ./docker-compose.test.yml
PNPM := pnpm

NEST_DIR := backend/nest-server
FRONT_DIR := frontend


# --- prod ---
up:
	${COMPOSE} --profile monitoring up --build

# --- dev (hot reload, local ports) ---
dev:
	${COMPOSE_DEV} --profile monitoring up

monitoring:
	${COMPOSE} --profile monitoring up -d \
	grafana prometheus cadvisor node-exporter

# --- cleanup ---
down:
	${COMPOSE_ALL} down --remove-orphans

clean:
	${COMPOSE_ALL} down --remove-orphans --rmi all

fclean:
	${COMPOSE_ALL} down --remove-orphans -v --rmi all

re:
	$(MAKE) clean
	$(MAKE) up

# --- tests ---
unit:
	cd $(NEST_DIR) && $(PNPM) test || echo -n

test:
	${COMPOSE_TEST} build nest-server-test && \
	${COMPOSE_TEST} up -d --wait postgres-test redis-test minio-test && \
	${COMPOSE_TEST} up minio-init-test && \
	${COMPOSE_TEST} run --rm nest-server-test; \
	status=$$?; \
	${COMPOSE_TEST} down -v; \
	exit $$status

test-clean:
	${COMPOSE_TEST} down -v --rmi all

# --- github actions ---
deps-nest:
	cd $(NEST_DIR) && $(PNPM) install --frozen-lockfile
deps-front:
	cd $(FRONT_DIR) && $(PNPM) install --frozen-lockfile

build-nest:
	cd $(NEST_DIR) && $(PNPM) run build
build-front:
	cd $(FRONT_DIR) && $(PNPM) run build


.PHONY: up dev monitoring down clean fclean re unit test test-clean \
	deps-nest deps-front build-nest build-front
