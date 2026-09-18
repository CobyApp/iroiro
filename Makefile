.PHONY: init clean

init:
	docker compose up -d

clean:
	docker compose down -v
