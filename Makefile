.PHONY: all validate render pdf check install clean

PYTHON ?= python3

# Validate, regenerate Markdown, rebuild the PDF.
all: validate render pdf

install:
	$(PYTHON) -m pip install -r requirements.txt

validate:
	$(PYTHON) scripts/validate.py

render:
	$(PYTHON) scripts/render_markdown.py

pdf:
	$(PYTHON) scripts/build_pdf.py

# CI gate: entries valid and rendered/ not stale. Makes no changes.
check:
	$(PYTHON) scripts/validate.py --quiet
	$(PYTHON) scripts/render_markdown.py --check

clean:
	rm -f rendered/*.md rendered/*.pdf
