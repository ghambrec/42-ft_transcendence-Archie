COMPOSE := docker compose -f ./docker-compose.yml
COMPOSE_DEV := ${COMPOSE} -f ./docker-compose.dev.yml
COMPOSE_TEST := docker compose -p documents-system-test -f ./docker-compose.test.yml
PNPM := pnpm

NEST_DIR := backend/nest-server
FRONT_DIR := frontend/
FRONTEND_DIR := frontend




up:
	${COMPOSE} --profile monitoring up --build

dev:
	${COMPOSE_DEV} --profile monitoring up

down:
	${COMPOSE_DEV} down

clean:
	${COMPOSE} down --rmi all

fclean:
	${COMPOSE} down -v --rmi all

re:
	make clean
	make up

monitoring: 
	${COMPOSE} --profile monitoring up -d \
	grafana prometheus cadvisor node-exporter

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

# Github actions
deps-nest:
	cd $(NEST_DIR) && $(PNPM) install --frozen-lockfile
deps-front:
	cd $(FRONT_DIR) && $(PNPM) install --frozen-lockfile

build-nest:
	cd $(NEST_DIR) && $(PNPM) run build
build-front:
	cd $(FRONT_DIR) && $(PNPM) run build


.PHONY: monitoring re clean fclean down up dev deps-nest deps-front build-nest build-front test-clean